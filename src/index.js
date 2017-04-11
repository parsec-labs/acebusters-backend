import { AttributeValue } from 'dynamodb-data-types';
import { PokerHelper } from 'poker-helper';

const EMPTY_ADDR = '0x0000000000000000000000000000000000000000';

const leaveReceived = function leaveReceived(oldHand, newHand) {
  for (let i = 0; i < newHand.lineup.length; i++) {
    if (newHand.lineup[i].exitHand !== undefined && 
      oldHand.lineup[i].exitHand === undefined) {
      // return after first leave detected
      // we don't expect more than one per db change
      return i;
    }
  }
  return -1;
}

const findActingPlayer = function findActingPlayer(oldHand, newHand) {
  if (newHand.lineup && oldHand.lineup) {
    for (let i = 0; i < newHand.lineup.length; i++) {
      if (oldHand.lineup[i] && newHand.lineup[i] && 
        newHand.lineup[i].last && 
        oldHand.lineup[i].last !== newHand.lineup[i].last) {
        return { signerAddr: newHand.lineup[i].address, pos: i };
      }
    }
  }
  return null;
}

const countTakenSeats = function countTakenSeats(lineup) {
  var taken = 0;
  for (let i = 0; i < lineup.length; i++) {
    if (lineup[i].address && lineup[i].address !== EMPTY_ADDR) {
      taken += 1;
    }
  }
  return taken;
}

const lineupHasLeave = function lineupHasLeave(newHand) {
  for (let i = 0; i < newHand.lineup.length; i++) {
    if (newHand.lineup[i].exitHand === newHand.handId) {
      return i;
    }
  }
  return -1;
}

const renderPublicState = function renderPublicState(hand, rc) {
  if (hand.state == 'showdown') {
    for (let i = 0; i < hand.lineup.length; i++) {
      if (hand.lineup[i].last) {
        const last = rc.get(hand.lineup[i].last);
        if (last.abi[0].name == 'show') {
          hand.lineup[i].cards = [];
          hand.lineup[i].cards.push(hand.deck[i * 2]);
          hand.lineup[i].cards.push(hand.deck[i * 2 + 1]);
        }
      }
    }
  }
  const rv = {
    handId: hand.handId,
    lineup: hand.lineup,
    dealer: hand.dealer,
    state: hand.state,
    changed: hand.changed,
    cards: []
  }
  if (hand.state == 'flop') {
    rv.preMaxBet = hand.preMaxBet;
    rv.cards.push(hand.deck[20]);
    rv.cards.push(hand.deck[21]);
    rv.cards.push(hand.deck[22]);
  }
  if (hand.state == 'turn') {
    rv.preMaxBet = hand.preMaxBet;
    rv.flopMaxBet = hand.flopMaxBet;
    rv.cards.push(hand.deck[20]);
    rv.cards.push(hand.deck[21]);
    rv.cards.push(hand.deck[22]);
    rv.cards.push(hand.deck[23]);
  }
  if (hand.state == 'river') {
    rv.preMaxBet = hand.preMaxBet;
    rv.flopMaxBet = hand.flopMaxBet;
    rv.turnMaxBet = hand.turnMaxBet;
    rv.cards.push(hand.deck[20]);
    rv.cards.push(hand.deck[21]);
    rv.cards.push(hand.deck[22]);
    rv.cards.push(hand.deck[23]);
    rv.cards.push(hand.deck[24]);
  }
  if (hand.state == 'showdown') {
    rv.preMaxBet = hand.preMaxBet;
    rv.flopMaxBet = hand.flopMaxBet;
    rv.turnMaxBet = hand.turnMaxBet;
    rv.riverMaxBet = hand.riverMaxBet;
    rv.cards.push(hand.deck[20]);
    rv.cards.push(hand.deck[21]);
    rv.cards.push(hand.deck[22]);
    rv.cards.push(hand.deck[23]);
    rv.cards.push(hand.deck[24]);
  }
  if (hand.distribution) {
    rv.distribution = hand.distribution;
  }
  if (hand.netting) {
    rv.netting = hand.netting;
  }
  return rv;
}

var StreamScanner = function(sns, topicArn, pusher, rc, sentry) {
  this.sns = sns;
  this.topicArn = topicArn;
  this.pusher = pusher;
  this.rc = rc;
  this.sentry = sentry;
}

StreamScanner.prototype.process = function process(record) {
  if (!record || !record.dynamodb ||
    (record.eventName !== 'MODIFY' && record.eventName !== 'INSERT')) {
    return Promise.resolve('unknown record type: ' + JSON.stringify(record));
  }
  const tasks = [];
  const newHand = AttributeValue.unwrap(record.dynamodb.NewImage);
  const keys = AttributeValue.unwrap(record.dynamodb.Keys);

  // check update
  const msg = renderPublicState(newHand, this.rc);
  tasks.push(this.publishUpdate(keys.tableAddr, msg));


  if (record.eventName === 'INSERT') {
    return Promise.all(tasks);
  }

  const oldHand = AttributeValue.unwrap(record.dynamodb.OldImage);

  // check leave
  var pos = leaveReceived(oldHand, newHand);
  if (pos > -1) {

    // send leave receipt to contract
    tasks.push(this.notify('TableLeave::' + keys.tableAddr, {
      leaveReceipt: newHand.lineup[pos].leaveReceipt,
      tableAddr: keys.tableAddr
    }, this.topicArn));
    // also, if the leave is for last hand, we can create a distribution already
    if (newHand.lineup[pos].exitHand < newHand.handId) {
      tasks.push(this.notify('TableNettingRequest::'+keys.tableAddr, {
        tableAddr: keys.tableAddr,
        handId: newHand.lineup[pos].exitHand
      }, this.topicArn));
    }
  }

  // check hand complete
  const ph = new PokerHelper(this.rc);
  if (ph.checkForNextHand(newHand) === true &&
    ( !oldHand.lineup || ph.checkForNextHand(oldHand) === false )) {
    tasks.push(this.notify('HandComplete::'+keys.tableAddr, {
      tableAddr: keys.tableAddr,
      handId: newHand.handId
    }, this.topicArn));
    pos = lineupHasLeave(newHand);
    if (pos > -1 && newHand.netting === undefined) {
      tasks.push(this.notify('TableNettingRequest::'+keys.tableAddr, {
        tableAddr: keys.tableAddr,
        handId: newHand.handId
      }, this.topicArn));
    }
  }

  // send event to sentry
  const actingPlayer = findActingPlayer(oldHand, newHand);
  if (actingPlayer) {
    tasks.push(this.log('action: ' + actingPlayer.signerAddr, {
      user: {
        id: actingPlayer.signerAddr
      },
      level: 'info',
      tags: {
        tableAddr: keys.tableAddr,
        handId: newHand.handId
      }
    }));
  }


  // check netting complete
  if (newHand.lineup !== undefined && oldHand.netting !== undefined &&
    newHand.netting !== undefined) {
    const taken = countTakenSeats(newHand.lineup);
    if ( Object.keys(newHand.netting).length > Object.keys(oldHand.netting).length &&
    Object.keys(newHand.netting).length - 2 >= taken) {

      // send settle tx with complete netting to table
      tasks.push(this.notify('TableNettingComplete::'+keys.tableAddr, {
        tableAddr: keys.tableAddr,
        handId: newHand.handId,
        netting: newHand.netting
      }, this.topicArn));
    }
  }

  return Promise.all(tasks);
}

StreamScanner.prototype.publishUpdate = function publishUpdate(topic, msg) {
  return new Promise((fulfill, reject) => {
    try {
      const rsp = this.pusher.trigger(topic, 'update', msg);
      fulfill(rsp);
    } catch (err) {
      reject(err);
    }
  });
}

StreamScanner.prototype.log = function log(message, context) {
  const cntxt = (context) || {};
  cntxt.level = (cntxt.level) ? cntxt.level : 'info';
  return new Promise((fulfill, reject) => {
    this.sentry.captureMessage(message, cntxt, (error, eventId) => {
      if (error) {
        reject(error);
        return;
      }
      fulfill(eventId);
    });
  });
};

StreamScanner.prototype.notify = function notify(subject, event, topicArn) {
  return new Promise((fulfill, reject) => {
    this.sns.publish({
      Message: JSON.stringify(event),
      Subject: subject,
      TopicArn: topicArn
    }, function(err, rsp){
      if (err) {
        reject(err);
        return;
      }
      fulfill({});
    });
  });
}

module.exports = StreamScanner;
