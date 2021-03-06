import chai, { expect } from 'chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import BigNumber from 'bignumber.js';
import { Receipt, ReceiptCache } from 'poker-helper';
import { it, describe, afterEach } from 'mocha';
import StreamWorker from './src/index';
import Logger from './src/logger';

chai.use(sinonChai);

const NTZ_DECIMAL = new BigNumber(10).pow(12);
function babz(ntz) {
  return new BigNumber(ntz).mul(NTZ_DECIMAL);
}

const P1_ADDR = '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74';
const P1_PRIV = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';

// secretSeed: 'brother mad churn often amount wing pretty critic rhythm man insane ridge' }
const P2_ADDR = '0xe10f3d125e5f4c753a6456fc37123cf17c6900f2';
const P2_PRIV = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';

const P3_ADDR = '0xb7164eD7ce81F1940923F3fc9c1e50F703840863';
const P3_PRIV = '0xc6d34959ee31f2e2577aa678ef8b8c3cda3176727c2e3588c95e99e9d95714d3';

const ORACLE_ADDR = '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f';

const EMPTY_ADDR = '0x0000000000000000000000000000000000000000';

const topicArn = 'arn:aws:sns:eu-west-1:123:ab-events';

const sns = {
  publish() {},
};

const pusher = {
  trigger() {},
};

const sentry = {
  captureMessage() {},
};

const logger = new Logger(sentry, 'stream-scanner');

const rc = new ReceiptCache();

describe('Stream scanner', () => {
  it('should send tx on new leave receipt for prev hand.', (done) => {
    const event = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          tableAddr: { S: '0x77aabb11ee' },
        },
        NewImage: {
          handId: { N: '3' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR } } },
            { M: {
              address: {
                S: P2_ADDR,
              },
              exitHand: {
                N: '2',
              },
            } },
          ] },
        },
        OldImage: {
          handId: { N: '3' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR } } },
            { M: { address: { S: P2_ADDR } } },
          ] },
        },
      },
    };

    sinon.stub(sns, 'publish').yields(null, {});

    const worker = new StreamWorker(sns, topicArn, pusher, rc);

    worker.process(event).then(() => {
      expect(sns.publish).callCount(2);
      expect(sns.publish).calledWith({
        Subject: 'TableLeave::0x77aabb11ee',
        Message: JSON.stringify({
          leaverAddr: P2_ADDR,
          tableAddr: '0x77aabb11ee',
          exitHand: 2,
        }),
        TopicArn: topicArn,
      });
      expect(sns.publish).calledWith({
        Subject: 'TableNettingRequest::0x77aabb11ee',
        Message: JSON.stringify({
          tableAddr: '0x77aabb11ee',
          handId: 2,
        }),
        TopicArn: topicArn,
      });
      done();
    }).catch(done);
  });

  it('should silently ignore deletes.', (done) => {
    const event = {
      eventName: 'REMOVE',
      dynamodb: {},
    };

    sinon.stub(sns, 'publish').yields(null, {});

    const worker = new StreamWorker(sns, topicArn, pusher, rc);

    worker.process(event).then((rsp) => {
      expect(rsp).to.contain('unknown record');
      expect(sns.publish).callCount(0);
      done();
    }).catch(done);
  });

  it('should send tx on new leave receipt for this hand.', (done) => {
    const event = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          tableAddr: { S: '0x77aabb11ee' },
        },
        NewImage: {
          handId: { N: '3' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR } } },
            { M: {
              address: {
                S: P2_ADDR,
              },
              exitHand: {
                N: '3',
              },
            } },
          ] },
        },
        OldImage: {
          handId: { N: '3' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR } } },
            { M: { address: { S: P2_ADDR } } },
          ] },
        },
      },
    };

    sinon.stub(sns, 'publish').yields(null, {});

    const worker = new StreamWorker(sns, topicArn, pusher, rc);

    worker.process(event).then(() => {
      expect(sns.publish).callCount(1);
      expect(sns.publish).calledWith({
        Subject: 'TableLeave::0x77aabb11ee',
        Message: JSON.stringify({
          leaverAddr: P2_ADDR,
          tableAddr: '0x77aabb11ee',
          exitHand: 3,
        }),
        TopicArn: topicArn,
      });
      done();
    }).catch(done);
  });

  it('should send event when hand turns complete.', (done) => {
    const bet1 = new Receipt(EMPTY_ADDR).bet(2, babz(500)).sign(P1_PRIV);
    const bet2 = new Receipt(EMPTY_ADDR).bet(2, babz(1000)).sign(P2_PRIV);
    const fold = new Receipt(EMPTY_ADDR).fold(2, babz(500)).sign(P1_PRIV);

    const event = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          tableAddr: {
            S: '0x77aabb11ee0000',
          },
        },
        OldImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR }, last: { S: bet1 } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 } } },
          ] },
        },
        NewImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR }, last: { S: fold } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 } } },
          ] },
        },
      },
    };
    sinon.stub(sentry, 'captureMessage').yields(null, {});
    sinon.stub(sns, 'publish').yields(null, {});

    const worker = new StreamWorker(sns, topicArn, pusher, rc, logger);

    worker.process(event).then(() => {
      expect(sns.publish).callCount(1);
      expect(sns.publish).calledWith({
        Subject: 'HandComplete::0x77aabb11ee0000',
        Message: JSON.stringify({
          tableAddr: '0x77aabb11ee0000',
          handId: 2,
        }),
        TopicArn: topicArn,
      });
      done();
    }).catch(done);
  });

  it('should send event when hand turns complete with incomplete old Hand.', (done) => {
    const bet2 = new Receipt(EMPTY_ADDR).bet(2, babz(1000)).sign(P2_PRIV);
    const fold = new Receipt(EMPTY_ADDR).fold(2, babz(500)).sign(P1_PRIV);

    const event = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          tableAddr: {
            S: '0x77aabb11ee0000',
          },
        },
        OldImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
        },
        NewImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR }, last: { S: fold } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 } } },
          ] },
        },
      },
    };

    sinon.stub(sns, 'publish').yields(null, {});

    const worker = new StreamWorker(sns, topicArn, pusher, rc);

    worker.process(event).then(() => {
      expect(sns.publish).callCount(1);
      expect(sns.publish).calledWith({
        Subject: 'HandComplete::0x77aabb11ee0000',
        Message: JSON.stringify({
          tableAddr: '0x77aabb11ee0000',
          handId: 2,
        }),
        TopicArn: topicArn,
      });
      done();
    }).catch(done);
  });

  it('should not send HandComplete event when hand is in waiting state and small blind times out.', (done) => {
    const event = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          tableAddr: {
            S: '0x77aabb11ee0000',
          },
        },
        OldImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          state: { S: 'waiting' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR } }},
            { M: { address: { S: P2_ADDR } }},
          ] },
        },
        NewImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          state: { S: 'waiting' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR }, sitout: { N: '123' } } },
            { M: { address: { S: P2_ADDR } }},
          ] },
        },
      },
    };

    sinon.stub(sns, 'publish').yields(null, {});

    const worker = new StreamWorker(sns, topicArn, pusher, rc);

    worker.process(event).then(() => {
      expect(sns.publish).callCount(0);
      done();
    }).catch(done);
  });

  it('should not send event when hand was complete already.', (done) => {
    const bet2 = new Receipt(EMPTY_ADDR).bet(2, babz(1000)).sign(P2_PRIV);
    const fold = new Receipt(EMPTY_ADDR).fold(2, babz(500)).sign(P1_PRIV);

    const event = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          tableAddr: {
            S: '0x77aabb11ee0000',
          },
        },
        OldImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR }, last: { S: fold } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 } } },
          ] },
        },
        NewImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR }, last: { S: fold } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 } } },
          ] },
        },
      },
    };

    sinon.stub(sns, 'publish').yields(null, {});

    const worker = new StreamWorker(sns, topicArn, pusher, rc);

    worker.process(event).then(() => {
      expect(sns.publish).callCount(0);
      done();
    }).catch(done);
  });

  it('should create netting when hand with leaving player turns complete.', (done) => {
    const bet1 = new Receipt(EMPTY_ADDR).bet(2, babz(500)).sign(P1_PRIV);
    const bet2 = new Receipt(EMPTY_ADDR).bet(2, babz(1000)).sign(P2_PRIV);
    const fold = new Receipt(EMPTY_ADDR).fold(2, babz(500)).sign(P1_PRIV);

    const event = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          tableAddr: {
            S: '0x77aabb11ee0000',
          },
        },
        OldImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR }, last: { S: bet1 } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 }, exitHand: { N: '2' } } },
          ] },
        },
        NewImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR }, last: { S: fold } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 }, exitHand: { N: '2' } } },
          ] },
        },
      },
    };
    sinon.stub(sentry, 'captureMessage').yields(null, {});
    sinon.stub(sns, 'publish').yields(null, {});

    const worker = new StreamWorker(sns, topicArn, pusher, rc, logger);

    worker.process(event).then(() => {
      expect(sns.publish).callCount(2);
      expect(sns.publish).calledWith({
        Subject: 'HandComplete::0x77aabb11ee0000',
        Message: JSON.stringify({
          tableAddr: '0x77aabb11ee0000',
          handId: 2,
        }),
        TopicArn: topicArn,
      });
      expect(sns.publish).calledWith({
        Subject: 'TableNettingRequest::0x77aabb11ee0000',
        Message: JSON.stringify({
          tableAddr: '0x77aabb11ee0000',
          handId: 2,
        }),
        TopicArn: topicArn,
      });
      done();
    }).catch(done);
  });

  it('should submit when netting complete.', (done) => {
    const bet1 = new Receipt(EMPTY_ADDR).bet(2, babz(1000)).sign(P1_PRIV);
    const bet2 = new Receipt(EMPTY_ADDR).bet(2, babz(1000)).sign(P2_PRIV);
    const event = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          tableAddr: {
            S: '0x77aabb11ee00',
          },
        },
        OldImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          state: { S: 'preflop' },
          lineup: { L: [
            { M: { address: { S: EMPTY_ADDR } } },
            { M: { address: { S: P1_ADDR }, last: { S: bet1 }, sitout: { S: 'allin' } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 } } },
            { M: { address: { S: EMPTY_ADDR } } },
          ] },
          netting: { M: {
            newBalances: { S: '0x112233' },
            [ORACLE_ADDR]: { S: '0x223344' },
            [P1_ADDR]: { S: '0x334455' },
          } },
        },
        NewImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          state: { S: 'showdown' },
          deck: { L: [{ N: 0 }, { N: 1 }, { N: 2 }, { N: 3 }] },
          lineup: { L: [
            { M: { address: { S: EMPTY_ADDR } } },
            { M: { address: { S: P1_ADDR }, last: { S: bet1 }, sitout: { S: 'allin' } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 } } },
            { M: { address: { S: EMPTY_ADDR } } },
          ] },
          netting: { M: {
            newBalances: { S: '0x112233' },
            [ORACLE_ADDR]: { S: '0x223344' },
            [P1_ADDR]: { S: '0x334455' },
            [P2_ADDR]: { S: '0x445566' },
          } },
        },
      },
    };
    sinon.stub(sns, 'publish').yields(null, {});

    const worker = new StreamWorker(sns, topicArn, pusher, rc);

    worker.process(event).then(() => {
      expect(sns.publish).callCount(1);
      expect(sns.publish).calledWith({
        Subject: 'TableNettingComplete::0x77aabb11ee00',
        Message: JSON.stringify({
          tableAddr: '0x77aabb11ee00',
          handId: 2,
          netting: {
            newBalances: '0x112233',
            [ORACLE_ADDR]: '0x223344',
            [P1_ADDR]: '0x334455',
            [P2_ADDR]: '0x445566',
          },
        }),
        TopicArn: topicArn,
      });
      done();
    }).catch(done);
  });

  it('should not submit settlement if hand is marked as netted.', (done) => {
    const bet1 = new Receipt(EMPTY_ADDR).bet(2, babz(1000)).sign(P1_PRIV);
    const bet2 = new Receipt(EMPTY_ADDR).bet(2, babz(1000)).sign(P2_PRIV);
    const event = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          tableAddr: {
            S: '0x77aabb11ee00',
          },
        },
        OldImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          state: { S: 'preflop' },
          lineup: { L: [
            { M: { address: { S: EMPTY_ADDR } } },
            { M: { address: { S: P1_ADDR }, last: { S: bet1 }, sitout: { S: 'allin' } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 } } },
            { M: { address: { S: EMPTY_ADDR } } },
          ] },
          netting: { M: {
            newBalances: { S: '0x112233' },
            [ORACLE_ADDR]: { S: '0x223344' },
            [P1_ADDR]: { S: '0x334455' },
          } },
        },
        NewImage: {
          dealer: { N: '0' },
          handId: { N: '2' },
          state: { S: 'showdown' },
          deck: { L: [{ N: 0 }, { N: 1 }, { N: 2 }, { N: 3 }] },
          lineup: { L: [
            { M: { address: { S: EMPTY_ADDR } } },
            { M: { address: { S: P1_ADDR }, last: { S: bet1 }, sitout: { S: 'allin' } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 } } },
            { M: { address: { S: EMPTY_ADDR } } },
          ] },
          is_netted: { B: true },
          netting: { M: {
            newBalances: { S: '0x112233' },
            [ORACLE_ADDR]: { S: '0x223344' },
            [P1_ADDR]: { S: '0x334455' },
            [P2_ADDR]: { S: '0x445566' },
          } },
        },
      },
    };
    sinon.stub(sns, 'publish').yields(null, {});

    const worker = new StreamWorker(sns, topicArn, pusher, rc);

    worker.process(event).then(() => {
      expect(sns.publish).callCount(0);
      done();
    }).catch(done);
  });

  it('should send changed hand state to websocket.', (done) => {
    const event = {
      eventName: 'MODIFY',
      dynamodb: {
        Keys: {
          tableAddr: { S: '0x77aabb11ee' },
          handId: { N: 3 },
        },
        NewImage: {
          state: { S: 'waiting' },
          handId: { N: 3 },
          sb: { N: 50 },
          dealer: { N: 0 },
          changed: { N: 123 },
          deck: { L: [{ N: 0 }, { N: 1 }, { N: 2 }, { N: 3 }] },
          lineup: { L: [
            { M: { address: { S: '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f' } } },
            { M: {
              address: {
                S: '0xc3ccb3902a164b83663947aff0284c6624f3fbf2',
              },
            } },
          ] },
        },
        OldImage: {},
      },
    };

    sinon.stub(pusher, 'trigger').returns(null);

    const worker = new StreamWorker(sns, topicArn, pusher, rc);

    worker.process(event).then(() => {
      expect(pusher.trigger).callCount(1);
      expect(pusher.trigger).calledWith('0x77aabb11ee', 'update', {
        type: 'handUpdate',
        payload: {
          cards: [],
          changed: 123,
          dealer: 0,
          handId: 3,
          sb: 50,
          lineup: [{ address: '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f' }, { address: '0xc3ccb3902a164b83663947aff0284c6624f3fbf2' }],
          state: 'waiting',
        },
      });
      done();
    }).catch(done);
  });

  it('should send new hand state to websocket.', (done) => {
    const event = {
      eventName: 'INSERT',
      dynamodb: {
        Keys: {
          tableAddr: { S: '0x77aabb11ee' },
          handId: { N: 3 },
        },
        NewImage: {
          state: { S: 'waiting' },
          handId: { N: 3 },
          sb: { N: 50 },
          dealer: { N: 0 },
          changed: { N: 123 },
          deck: { L: [{ N: 0 }, { N: 1 }, { N: 2 }, { N: 3 }] },
          lineup: { L: [
            { M: { address: { S: '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f' } } },
            { M: {
              address: {
                S: '0xc3ccb3902a164b83663947aff0284c6624f3fbf2',
              },
            } },
          ] },
        },
      },
    };

    sinon.stub(pusher, 'trigger').returns(null);

    const worker = new StreamWorker(sns, topicArn, pusher, rc);

    worker.process(event).then(() => {
      expect(pusher.trigger).callCount(1);
      expect(pusher.trigger).calledWith('0x77aabb11ee', 'update', {
        type: 'handUpdate',
        payload: {
          cards: [],
          changed: 123,
          dealer: 0,
          sb: 50,
          handId: 3,
          lineup: [{ address: '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f' }, { address: '0xc3ccb3902a164b83663947aff0284c6624f3fbf2' }],
          state: 'waiting',
        },
      });
      done();
    }).catch(done);
  });


  afterEach(() => {
    if (sentry.captureMessage.restore) sentry.captureMessage.restore();
    if (sns.publish.restore) sns.publish.restore();
    if (pusher.trigger.restore) pusher.trigger.restore();
  });
});
