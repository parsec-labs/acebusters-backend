const expect = require('chai').expect;
const sinon = require('sinon');
require('chai').use(require('sinon-chai'));
const EWT = require('ethereum-web-token');
const BigNumber = require('bignumber.js');
const Receipt = require('poker-helper').Receipt;

const EventWorker = require('./lib/index');
const Table = require('./lib/tableContract');
const Factory = require('./lib/factoryContract');
const Db = require('./lib/db');

const ABI_BET = [{name: 'bet', type: 'function', inputs: [{type: 'uint'}, {type: 'uint'}]}];
const ABI_FOLD = [{name: 'fold', type: 'function', inputs: [{type: 'uint'}, {type: 'uint'}]}];
const ABI_DIST = [{name: 'distribution', type: 'function', inputs: [{type: 'uint'},{type: 'uint'},{type: 'bytes32[]'}]}];

const P1_ADDR = '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74';
const P1_PRIV = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';

//secretSeed: 'brother mad churn often amount wing pretty critic rhythm man insane ridge' }
const P2_ADDR = '0xe10f3d125e5f4c753a6456fc37123cf17c6900f2';
const P2_PRIV = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';

//secretSeed: 'erosion warm student north injury good evoke river despair critic wrestle unveil' }
const P3_ADDR = '0xc3ccb3902a164b83663947aff0284c6624f3fbf2';
const P3_KEY = '0x71d2b12dad610fc929e0596b6e887dfb711eec286b7b8b0bdd742c0421a9c425';

//secretSeed: 'erode melody nature bounce sample deny spend give craft alcohol supply roof' }
const ORACLE_ADDR = '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f';
const ORACLE_PRIV = '0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4';

const EMPTY_ADDR = '0x0000000000000000000000000000000000000000';

var contract = {
  leave: {
    sendTransaction: function(){}, 
  },
  settle: {
    sendTransaction: function(){}, 
  },
  payoutFrom: {
    sendTransaction: function(){}, 
  },
  create: {
    sendTransaction: function(){}, 
  },
  getLineup: {
    call: function(){}
  },
  smallBlind: {
    call: function(){}
  }
};

var web3 = { eth: {
  contract: function(){},
  at: function(){}
}};

var dynamo = {
  getItem: function(){},
  putItem: function(){},
  query: function(){},
  updateItem: function(){}
};

sinon.stub(web3.eth, 'contract').returns(web3.eth);
sinon.stub(web3.eth, 'at').returns(contract);

describe('Stream worker', function() {

  it('should handle TableLeave event.', (done) => {
    const handId = 2;
    const tableAddr = EMPTY_ADDR;
    const leaveReceipt = Receipt.leave(tableAddr, handId, P1_ADDR).sign(ORACLE_PRIV);
    const leaveHex = Receipt.leave(tableAddr, handId, P1_ADDR).signToHex(ORACLE_PRIV);

    const event = {
      Subject: 'TableLeave::' + tableAddr,
      Message: JSON.stringify({
        tableAddr: tableAddr,
        leaveReceipt: leaveReceipt
      })
    };
    const lineup = [new BigNumber(handId-1), [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [new BigNumber(0), new BigNumber(0)]];
    sinon.stub(contract.getLineup, 'call').yields(null, lineup);
    sinon.stub(contract.leave, 'sendTransaction').yields(null, '0x112233');

    const worker = new EventWorker(new Table(web3, '0x1255'));

    Promise.all(worker.process(event)).then(function(tx) {
      expect(tx[0]).to.eql([ '0x112233', '' ]);
      expect(contract.leave.sendTransaction).calledWith(leaveHex, {from: '0x1255', gas: sinon.match.any}, sinon.match.any);
      done();
    }).catch(done);

  });

 it('should handle TableLeave and Payout if netting not needed.', (done) => {
    const handId = 2;
    const tableAddr = EMPTY_ADDR;
    const leaveReceipt = Receipt.leave(tableAddr, handId, P1_ADDR).sign(ORACLE_PRIV);
    const leaveHex = Receipt.leave(tableAddr, handId, P1_ADDR).signToHex(ORACLE_PRIV);

    const event = {
      Subject: 'TableLeave::' + tableAddr,
      Message: JSON.stringify({
        tableAddr: tableAddr,
        leaveReceipt: leaveReceipt
      })
    };
    const lineup = [new BigNumber(handId), [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [new BigNumber(0), new BigNumber(0)]];
    sinon.stub(contract.getLineup, 'call').yields(null, lineup);
    sinon.stub(contract.leave, 'sendTransaction').yields(null, '0x112233');
    sinon.stub(contract.payoutFrom, 'sendTransaction').yields(null, '0x445566');

    const worker = new EventWorker(new Table(web3, '0x1255'));

    Promise.all(worker.process(event)).then(function(tx) {
      expect(tx[0]).to.eql([ '0x112233', '0x445566' ]);
      expect(contract.leave.sendTransaction).calledWith(leaveHex, {from: '0x1255', gas: sinon.match.any}, sinon.match.any);
      expect(contract.payoutFrom.sendTransaction).calledWith(P1_ADDR, {from: '0x1255', gas: sinon.match.any}, sinon.match.any);
      done();
    }).catch(done);

  });

  // create netting when hand with leaving player turns complete.
  it('should handle HandComplete event.', (done) => {
    const bet1 = new EWT(ABI_BET).bet(2, 500).sign(P1_PRIV);
    const bet2 = new EWT(ABI_BET).bet(2, 1000).sign(P2_PRIV);
    const fold = new EWT(ABI_FOLD).fold(2, 500).sign(P1_PRIV);
    const distHand2 = new EWT(ABI_DIST).distribution(2, 0, [EWT.concat(P2_ADDR, 1500).toString('hex')]).sign(ORACLE_PRIV);

    const event = {
      Subject: 'HandComplete::0xa2decf075b96c8e5858279b31f644501a140e8a7',
      Message: JSON.stringify({
        tableAddr: '0xa2decf075b96c8e5858279b31f644501a140e8a7',
        handId: 2
      })
    };
    const lineup = [new BigNumber(0), [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [new BigNumber(0), new BigNumber(0)]];
    sinon.stub(contract.getLineup, 'call').yields(null, lineup);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 2,
      lineup: [{
        address: P1_ADDR,
        last: fold
      }, {
        address: P2_ADDR,
        last: bet2
      }],
      distribution: distHand2
    }]});
    sinon.stub(dynamo, 'putItem').yields(null, {});

    const worker = new EventWorker(new Table(web3, '0x1255'), null, new Db(dynamo));
    Promise.all(worker.process(event)).then(function(rsp) {
     expect(dynamo.putItem).calledWith({Item: {
        tableAddr: '0xa2decf075b96c8e5858279b31f644501a140e8a7',
        handId: 3,
        deck: sinon.match.any,
        state: 'waiting',
        dealer: 0,
        lineup: [{address: P1_ADDR},{address: P2_ADDR}],
        changed: sinon.match.any
      }, TableName: 'poker'});
      done();
    }).catch(done);
  });


  // create netting when hand with leaving player turns complete.
  it('should handle new Table.', (done) => {
    const event = { Subject: 'HandComplete::0xa2de', Message: '' };
    const lineup = [new BigNumber(0), [EMPTY_ADDR, EMPTY_ADDR], [new BigNumber(0), new BigNumber(0)], [new BigNumber(0), new BigNumber(0)]];
    sinon.stub(dynamo, 'query').yields(null, { Items: []});
    sinon.stub(contract.getLineup, 'call').yields(null, lineup);
    sinon.stub(dynamo, 'putItem').yields(null, {});

    const worker = new EventWorker(new Table(web3, '0x1255'), null, new Db(dynamo));
    Promise.all(worker.process(event)).then(function(rsp) {
     expect(dynamo.putItem).calledWith({Item: {
        tableAddr: '0xa2de',
        handId: 1,
        deck: sinon.match.any,
        state: 'waiting',
        dealer: 0,
        lineup: [{address: EMPTY_ADDR},{address: EMPTY_ADDR}],
        changed: sinon.match.any,
      }, TableName: 'poker'});
      done();
    }).catch(done);
  });



  // create netting when hand with leaving player turns complete.
  it('should handle TableNettingRequest event.', (done) => {
    const bet1 = new EWT(ABI_BET).bet(2, 500).sign(P1_PRIV);
    const bet2 = new EWT(ABI_BET).bet(2, 1000).sign(P2_PRIV);
    const fold = new EWT(ABI_FOLD).fold(2, 500).sign(P1_PRIV);
    const distHand2 = new EWT(ABI_DIST).distribution(2, 0, [EWT.concat(P2_ADDR, 1500).toString('hex')]).sign(ORACLE_PRIV);

    const event = {
      Subject: 'TableNettingRequest::0xa2decf075b96c8e5858279b31f644501a140e8a7',
      Message: JSON.stringify({
        tableAddr: '0xa2decf075b96c8e5858279b31f644501a140e8a7',
        handId: 2
      })
    };
    const lineup = [new BigNumber(0), [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [new BigNumber(0), new BigNumber(2)]];
    sinon.stub(contract.smallBlind, 'call').yields(null, new BigNumber(50));
    sinon.stub(contract.getLineup, 'call').yields(null, lineup);
    sinon.stub(dynamo, 'getItem').yields(null, {Item:{
      lineup: [{
        address: P1_ADDR,
        last: fold
      }, {
        address: P2_ADDR,
        last: bet2,
        lastHand: 2,
        leaveReceipt: '0x99'
      }],
      distribution: distHand2
    }}).onFirstCall().yields(null, {Item:{
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 10000).sign(P1_PRIV)
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 10000).sign(P2_PRIV)
      }],
      distribution: new EWT(ABI_DIST).distribution(1, 0, [EWT.concat(P1_ADDR, 20000).toString('hex')]).sign(ORACLE_PRIV)
    }});
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const worker = new EventWorker(new Table(web3, '0x1255'), null, new Db(dynamo), ORACLE_PRIV);
    Promise.all(worker.process(event)).then(function(rsp) {
      const netting = {
        '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f': '0x306f6bc2348440582ca694d4998b082d3b77ad25b62fcf2f22e526a14e50ecf45bdb61d92d77bce6b5c7bce2800ddda525af1622af6b3d6f918993431fff18551c',
        newBalances: '0x000000025b96c8e5858279b31f644501a140e8a7000000000000000082e8c6cf42c8d1ff9594b17a3f50e94a12cc860f000000000000e86cf3beac30c498d9e26865f34fcaa57dbb935b0d740000000000009e34e10f3d125e5f4c753a6456fc37123cf17c6900f2'
      };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':n', netting)));
      done();
    }).catch(done);
  });

  // submit netting when netting complete.
  it('should handle TableNettingComplete event.', (done) => {
    const event = {
      Subject: 'TableNettingComplete::0x1234',
      Message: JSON.stringify({
        tableAddr: '0x77aabb11ee00',
        handId: 2,
        netting: {
          newBalances: '0x112233',
          [ORACLE_ADDR]:  '0x223344',
          [P1_ADDR]: '0x334455',
          [P2_ADDR]: '0x445566'
        }
      })
    };
    sinon.stub(contract.settle, 'sendTransaction').yields(null, '0x123456');

    const worker = new EventWorker(new Table(web3, '0x1255'));
    Promise.all(worker.process(event)).then(function(rsp) {
      expect(rsp[0]).to.eql('0x123456');
      expect(contract.settle.sendTransaction).calledWith('0x112233', '0x223344334455445566', {from: '0x1255', gas: sinon.match.any}, sinon.match.any);
      done();
    }).catch(done);
  });

  it('should handle EmailConfirmed event.', (done) => {
    const event = {
      Subject: 'EmailConfirmed::0x1234',
      Message: JSON.stringify({
        signerAddr: '0x551100003300',
        accountId: 'someuuid'
      })
    };
    sinon.stub(contract.create, 'sendTransaction').yields(null, '0x123456');

    const worker = new EventWorker(null, new Factory(web3, '0x1255', '0x1234'));
    Promise.all(worker.process(event)).then(function(rsp) {
      expect(rsp[0]).to.eql('0x123456');
      expect(contract.create.sendTransaction).calledWith('0x551100003300', '0x1255', 259200, {from: '0x1255', gas: sinon.match.any}, sinon.match.any);
      done();
    }).catch(done);
  });

  // payout players after Netted event.
  it('should handle Netted event in table.', (done) => {
    const event = {
      Subject: 'ContractEvent::0x77aabb11ee00',
      Message: JSON.stringify({
        address: '0x77aabb11ee00',
        event : 'Netted',
        args: {}
      })
    };
    const lineup = [new BigNumber(2), [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [new BigNumber(0), new BigNumber(2)]];
    sinon.stub(contract.getLineup, 'call').yields(null, lineup);
    sinon.stub(contract.payoutFrom, 'sendTransaction').yields(null, '0x123456');

    const worker = new EventWorker(new Table(web3, '0x1255'));
    Promise.all(worker.process(event)).then(function(rsp) {
      expect(rsp[0]).to.eql(['0x123456']);
      expect(contract.payoutFrom.sendTransaction).calledWith(P2_ADDR, {from: '0x1255', gas: sinon.match.any}, sinon.match.any);
      done();
    }).catch(done);
  });

  // payout multiple players after Netted event.
  it('should handle Netted event in table for multiple players.', (done) => {
    const event = {
      Subject: 'ContractEvent::0x77aabb11ee00',
      Message: JSON.stringify({
        address: '0x77aabb11ee00',
        event : 'Netted',
        args: {}
      })
    };
    const lineup = [new BigNumber(2), [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [new BigNumber(1), new BigNumber(2)]];
    sinon.stub(contract.getLineup, 'call').yields(null, lineup);
    sinon.stub(contract.payoutFrom, 'sendTransaction')
      .yields(null, '0x123456')
      .onFirstCall().yields(null, '0x789abc');

    const worker = new EventWorker(new Table(web3, '0x1255'));
    Promise.all(worker.process(event)).then(function(rsp) {
      expect(rsp[0]).to.eql(['0x789abc', '0x123456']);
      expect(contract.payoutFrom.sendTransaction).callCount(2);
      expect(contract.payoutFrom.sendTransaction).calledWith(P1_ADDR, {from: '0x1255', gas: sinon.match.any}, sinon.match.any);
      expect(contract.payoutFrom.sendTransaction).calledWith(P2_ADDR, {from: '0x1255', gas: sinon.match.any}, sinon.match.any);
      done();
    }).catch(done);
  });

  it('should handle Table join.', (done) => {
    const event = {
      Subject: 'ContractEvent::0x77aabb11ee00',
      Message: JSON.stringify({
        address: '0x77aabb11ee00',
        event : 'Join',
        args: {}
      })
    };
    const lineup = [new BigNumber(2), [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [new BigNumber(0), new BigNumber(0)]];
    sinon.stub(contract.getLineup, 'call').yields(null, lineup);
    sinon.stub(dynamo, 'query').yields(null, {Items:[{
      handId: 3,
      state: 'waiting',
      lineup: [{
        address: P1_ADDR
      }, {
        // empty
      }]
    }]});
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const worker = new EventWorker(new Table(web3, '0x1255'), null, new Db(dynamo));
    Promise.all(worker.process(event)).then(function(rsp) {
      const seat = { address: P2_ADDR };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', seat)));
      done();
    }).catch(done);
  });

  it('should handle Table join after game started.', (done) => {
    const event = {
      Subject: 'ContractEvent::0x77aabb11ee00',
      Message: JSON.stringify({
        address: '0x77aabb11ee00',
        event : 'Join',
        args: {}
      })
    };
    const lineup = [new BigNumber(2), [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [new BigNumber(0), new BigNumber(0), new BigNumber(0)]];
    sinon.stub(contract.getLineup, 'call').yields(null, lineup);
    sinon.stub(dynamo, 'query').yields(null, {Items:[{
      handId: 3,
      state: 'flop',
      lineup: [{
        address: P1_ADDR
      }, {
        address: P2_ADDR
      }, {
        // empty
      }]
    }]});
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const worker = new EventWorker(new Table(web3, '0x1255'), null, new Db(dynamo));
    Promise.all(worker.process(event)).then(function(rsp) {
      const seat = { address: P3_ADDR, sitout: true };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', seat)));
      done();
    }).catch(done);
  });


  afterEach(function () {
    if (contract.leave.sendTransaction.restore) contract.leave.sendTransaction.restore();
    if (contract.settle.sendTransaction.restore) contract.settle.sendTransaction.restore();
    if (contract.payoutFrom.sendTransaction.restore) contract.payoutFrom.sendTransaction.restore();
    if (contract.create.sendTransaction.restore) contract.create.sendTransaction.restore();
    if (contract.getLineup.call.restore) contract.getLineup.call.restore();
    if (contract.smallBlind.call.restore) contract.smallBlind.call.restore();
    if (dynamo.getItem.restore) dynamo.getItem.restore();
    if (dynamo.putItem.restore) dynamo.putItem.restore();
    if (dynamo.query.restore) dynamo.query.restore();
    if (dynamo.updateItem.restore) dynamo.updateItem.restore();
  });

});
