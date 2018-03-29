import Contract from './contract';
import SnGTable from './sngTable';
import CashgameTable from './cashgameTable';

const ABI_TABLE_FACTORY = [{ constant: false, inputs: [{ name: '_newOwner', type: 'address' }], name: 'transfer', outputs: [], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'getTables', outputs: [{ name: '', type: 'address[]' }], payable: false, type: 'function' }, { constant: true, inputs: [{ name: '_addr', type: 'address' }], name: 'isOwner', outputs: [{ name: '', type: 'bool' }], payable: false, type: 'function' }, { constant: true, inputs: [{ name: '', type: 'uint256' }], name: 'tables', outputs: [{ name: '', type: 'address' }], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], payable: false, type: 'function' }, { constant: false, inputs: [{ name: '_smallBlind', type: 'uint96' }, { name: '_seats', type: 'uint256' }], name: 'create', outputs: [{ name: '', type: 'address' }], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'tokenAddress', outputs: [{ name: '', type: 'address' }], payable: false, type: 'function' }, { constant: true, inputs: [], name: 'oracleAddress', outputs: [{ name: '', type: 'address' }], payable: false, type: 'function' }, { constant: false, inputs: [{ name: '_token', type: 'address' }, { name: '_oracle', type: 'address' }], name: 'configure', outputs: [], payable: false, type: 'function' }];

export default class TableFactory extends Contract {
  constructor(
    factoryAddr,
    web3,
    senderAddr,
    sqs,
    queueUrl,
  ) {
    super(web3, senderAddr, sqs, queueUrl);
    this.factoryAddr = factoryAddr;
    this.cashgameTableAddrs = null;
    this.sngTable = new SnGTable(web3, senderAddr, sqs, queueUrl);
    this.cashgameTable = new CashgameTable(web3, senderAddr, sqs, queueUrl);
  }

  async init() {
    this.cashgameTableAddrs = await this.getTables();
  }

  async getTables() {
    const contract = this.web3.eth.contract(ABI_TABLE_FACTORY).at(this.factoryAddr);
    return this.call(contract.getTables.call);
  }

  getTable(tableAddr) {
    if (this.cashgameTableAddrs.indexOf(tableAddr) > -1) {
      return this.cashgameTable;
    }

    return this.sngTable;
  }

}