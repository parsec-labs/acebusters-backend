const TABLE_ABI = [{ constant: true, inputs: [], name: 'active', outputs: [{ name: '', type: 'bool' }], payable: false, type: 'function' }, { constant: true, inputs: [{ name: '_handId', type: 'uint256' }, { name: '_addr', type: 'address' }], name: 'getOut', outputs: [{ name: '', type: 'uint256' }, { name: '', type: 'uint256' }], payable: false, type: 'function' }, { constant: true, inputs: [{ name: '', type: 'uint256' }], name: 'seats', outputs: [{ name: 'senderAddr', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'signerAddr', type: 'address' }, { name: 'exitHand', type: 'uint256' }], payable: false, type: 'function' }, { constant: false, inputs: [{ name: '_toggleReceipt', type: 'bytes' }], name: 'toggleActive', outputs: [], payable: false, type: 'function' }, { constant: true, inputs: [{ name: '_addr', type: 'address' }], name: 'inLineup', outputs: [{ name: '', type: 'bool' }], payable: false, type: 'function' }, { constant: false, inputs: [{ name: '_r', type: 'bytes32' }, { name: '_s', type: 'bytes32' }, { name: '_pl', type: 'bytes32' }], name: 'leave', outputs: [], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'lastNettingRequestTime', outputs: [{ name: '', type: 'uint256' }], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'lastHandNetted', outputs: [{ name: '', type: 'uint32' }], payable: false, type: 'function' }, { constant: false, inputs: [{ name: '_sigs', type: 'bytes' }, { name: '_newBal1', type: 'bytes32' }, { name: '_newBal2', type: 'bytes32' }], name: 'settle', outputs: [], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'tokenAddr', outputs: [{ name: '', type: 'address' }], payable: false, type: 'function' }, { constant: false, inputs: [{ name: '_now', type: 'uint256' }], name: 'netHelp', outputs: [{ name: '', type: 'uint256' }], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'oracle', outputs: [{ name: '', type: 'address' }], payable: false, type: 'function' }, { constant: false, inputs: [{ name: '_data', type: 'bytes32[]' }], name: 'submit', outputs: [{ name: '', type: 'uint256' }], payable: false, type: 'function' }, { constant: true, inputs: [{ name: '', type: 'uint256' }], name: 'hands', outputs: [{ name: 'claimCount', type: 'uint256' }], payable: false, type: 'function' }, { constant: true, inputs: [{ name: '_handId', type: 'uint256' }, { name: '_addr', type: 'address' }], name: 'getIn', outputs: [{ name: '', type: 'uint256' }], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'getLineup', outputs: [{ name: '', type: 'uint256' }, { name: 'addresses', type: 'address[]' }, { name: 'amounts', type: 'uint256[]' }, { name: 'exitHands', type: 'uint256[]' }], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'lastNettingRequestHandId', outputs: [{ name: '', type: 'uint32' }], payable: false, type: 'function' }, { constant: false, inputs: [{ name: '_from', type: 'address' }, { name: '_value', type: 'uint256' }, { name: '_data', type: 'bytes' }], name: 'tokenFallback', outputs: [], payable: false, type: 'function' }, { constant: false, inputs: [], name: 'net', outputs: [], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'smallBlind', outputs: [{ name: '', type: 'uint256' }], payable: false, type: 'function' }, { inputs: [{ name: '_token', type: 'address' }, { name: '_oracle', type: 'address' }, { name: '_smallBlind', type: 'uint256' }, { name: '_seats', type: 'uint256' }], payable: false, type: 'constructor' }, { anonymous: false, inputs: [{ indexed: true, name: 'addr', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }], name: 'Join', type: 'event' }, { anonymous: false, inputs: [{ indexed: false, name: 'hand', type: 'uint256' }], name: 'NettingRequest', type: 'event' }, { anonymous: false, inputs: [{ indexed: false, name: 'hand', type: 'uint256' }], name: 'Netted', type: 'event' }, { anonymous: false, inputs: [{ indexed: false, name: 'addr', type: 'address' }], name: 'Leave', type: 'event' }];

function TableContract(web3, senderAddr) {
  this.web3 = web3;
  this.senderAddr = senderAddr;
}

TableContract.prototype.leave = function leave(tableAddr, leaveReceipt) {
  const contract = this.web3.eth.contract(TABLE_ABI).at(tableAddr);
  return new Promise((fulfill, reject) => {
    contract.leave.sendTransaction(...leaveReceipt,
      { from: this.senderAddr, gas: 200000 },
      (err, val) => {
        if (err) {
          reject(err);
          return;
        }
        fulfill(val);
      });
  });
};

TableContract.prototype.toggleTable = function toggleTable(tableAddr, activeReceipt) {
  const contract = this.web3.eth.contract(TABLE_ABI).at(tableAddr);
  return new Promise((fulfill, reject) => {
    contract.toggleActive.sendTransaction(activeReceipt,
      { from: this.senderAddr, gas: 200000 },
      (err, val) => {
        if (err) {
          reject(err);
          return;
        }
        fulfill(val);
      });
  });
};

TableContract.prototype.settle = function settle(tableAddr, newBalances, sigs) {
  const contract = this.web3.eth.contract(TABLE_ABI).at(tableAddr);
  return new Promise((fulfill, reject) => {
    contract.settle.sendTransaction(newBalances, sigs,
      { from: this.senderAddr, gas: 200000 },
      (err, val) => {
        if (err) {
          reject(err);
          return;
        }
        fulfill(val);
      });
  });
};

TableContract.prototype.net = function net(tableAddr) {
  const contract = this.web3.eth.contract(TABLE_ABI).at(tableAddr);
  return new Promise((fulfill, reject) => {
    contract.net.sendTransaction({ from: this.senderAddr, gas: 2600000 },
      (err, val) => {
        if (err) {
          reject(err);
          return;
        }
        fulfill(val);
      });
  });
};

TableContract.prototype.submit = function submit(tableAddr, receipts) {
  const contract = this.web3.eth.contract(TABLE_ABI).at(tableAddr);
  return new Promise((fulfill, reject) => {
    contract.submit.sendTransaction(receipts,
      { from: this.senderAddr, gas: 1900000 },
      (err, val) => {
        if (err) {
          reject(err);
          return;
        }
        fulfill(val);
      });
  });
};

TableContract.prototype.getSmallBlind = function getSmallBlind(tableAddr) {
  const contract = this.web3.eth.contract(TABLE_ABI).at(tableAddr);
  return new Promise((fulfill, reject) => {
    contract.smallBlind.call((err, val) => {
      if (err) {
        reject(err);
        return;
      }
      fulfill(val.toNumber());
    });
  });
};

TableContract.prototype.getLastHandNetted = function getLastHandNetted(tableAddr) {
  const contract = this.web3.eth.contract(TABLE_ABI).at(tableAddr);
  return new Promise((fulfill, reject) => {
    contract.lastHandNetted.call((err, val) => {
      if (err) {
        reject(err);
        return;
      }
      fulfill(val.toNumber());
    });
  });
};

TableContract.prototype.getLineup = function getLineup(tableAddr) {
  const contract = this.web3.eth.contract(TABLE_ABI).at(tableAddr);
  return new Promise((fulfill, reject) => {
    contract.getLineup.call((err, data) => {
      let error = err;
      if (!err && (!data || data.length < 4)) {
        error = 'lineup response invalid.';
      }
      if (error) {
        reject(error);
        return;
      }
      const rv = [];
      for (let i = 0; i < data[1].length; i += 1) {
        rv.push({
          address: data[1][i],
          amount: data[2][i],
          exitHand: data[3][i].toNumber(),
        });
      }
      fulfill({
        lastHandNetted: data[0].toNumber(),
        lineup: rv,
      });
    });
  });
};

module.exports = TableContract;
