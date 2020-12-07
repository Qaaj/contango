const ethers = require('ethers');
const fs = require('fs');
const provider = new ethers.providers.JsonRpcProvider();
const _ = require('lodash');
const CLI = require('clui'),
    clc = require('cli-color'),
    clear = require('clear');
const fetch = require('node-fetch');
const { Table } = require('console-table-printer');

const knownTokens = require('./addresses.json').tokens;
const knownContracts = require('./addresses.json').contracts;
const unknown = require('./addresses.json').unknown;

const queued = {};

const validatorAddress = '0x81839a763058daa0da5d792f5028922c0ac9e4975d2ac121b972f57ad7b82b190f156096cc547d5ebd0e2c485634e73a';

let currentblock = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let counter = 0;
let lastData;
let validatorData;
const colorFX = (num) => num ? clc.green : clc.red;

const doContractData = (txData) => {
    // console.log(txData)
    const known = { ...knownTokens, ...knownContracts}
    const contracts = _.groupBy(txData, 'to');
    const mostTx = _.sortBy(contracts, 'length').reverse();
    const top10 = _.slice(mostTx,0,10).map(list => {
        const { to, from  } = list[0];
        const counts = list.length;
        if(!known[to] && !queued[to] && !unknown[to]){
           queued[to] = 'QUEUED';
        }
        if(!to) console.log(' >>>> FROM', from);
        return {   to, counts };
    })
    const table = new Table({
        columns: [
            { name: 'address', alignment: 'left', title: 'Address' }, //with alignment and color
            { name: 'name', alignment: 'right', title: 'Name' },
            { name: 'counts', title: 'Count' },
        ],
    });
    top10.forEach(item => {
        table.addRow({
            address: item.to,
            name: known[item.to] || 'Unkown',
            counts: item.counts,
        })
    })
    table.printTable()

}

const fetchQueue = async () => {
    const queue = Object.keys(queued);
    if(queue.length > 0){
        const address = queue[0];
        delete queued[address];
        const result = await fetch(`https://api.coingecko.com/api/v3/coins/ethereum/contract/${address}`);
        const json = await result.json();
        if(json.id){
            console.log(' +++ Added Token',address,json.name);
            knownTokens[address] = `${json.name} (${json.symbol.toUpperCase()})`;

        }else{
            console.log(' +++ Added Unkown: ', address);
            unknown[address] = 'fail';
        }
        let file = JSON.stringify({
            contracts: knownContracts,
            tokens: knownTokens,
            unknown,
        });
        fs.writeFile('addresses.json', file, 'utf8', () =>{});
    }
    await sleep(5000);
    fetchQueue();
}

const updateUI = async (data = lastData, update) => {
    if(!data) return;
    lastData = data;
    clear();
    const {BLOCK_PERCENT_FULL, BLOCK,NUM_TXS, TOTAL_ETH_SENT, maxGas, averageGasHuman, minGas} = data;
    const min = clc.green(Math.round(minGas*100)/100);
    const avg = clc.yellow(Math.round(averageGasHuman*100)/100);
    const max = clc.red(Math.round(maxGas*100)/100);
    console.log('');
    console.log(`   ${clc.green('Block Height: \t\t')} ${clc.yellow.bold(BLOCK)}`);
    console.log( `   ${clc.green('Block Gas Limit Used:')} \t ${CLI.Gauge(BLOCK_PERCENT_FULL, 100, 20, 100, `${BLOCK_PERCENT_FULL.toString().substring(0, 5)} % \t`)}`);
    console.log('')
    console.log(`   ${clc.green('Gas Price [min, avg, max]:')} \t [ ${min} , ${avg} , ${max} ]`);
    console.log('')
    console.log(`   There was ${clc.green(TOTAL_ETH_SENT)} ETH sent in ${clc.green(NUM_TXS)} Transactions`);
    console.log('')
    console.log(update)
    console.log('')
    doContractData(data.txData);
    if(validatorData){
        let ok = 0, nok = 0;
        validatorData.forEach(item => item.status ? ok++ : nok++)
        const epoch = _.maxBy(validatorData, 'epoch').epoch;
        console.log(`   Attestations health for ${clc.yellow(validatorAddress.substr(0,15))}...  ${colorFX(1)(ok)} Succes - ${colorFX(-1)(nok)} Failed or Pending`);
        console.log(colorFX(validatorData[0].status)(`      > Latest Epoch ${epoch}: ${validatorData[0].status ? 'SUCCESS' : 'FAIL/PENDING'}`))
        console.log('')
    }
}

const parseTXs = async (txs) => {
    let failed = 0;
    const data = await Promise.all(txs.map(async (tx, i) => {
        await sleep(i * 2); // Don't hammer the node
        try {
            const {gasUsed, cumulativeGasUsed} = await provider.getTransactionReceipt(tx);
            const {gasPrice, gasLimit, from, to, value, hash} = await provider.getTransaction(tx);
            return {
                gasPrice: parseFloat(gasPrice),
                gas: parseFloat(gasPrice)/1e19,
                gasLimit: parseFloat(gasLimit), from, to,
                value: parseFloat(value),
                gasUsed: parseFloat(gasUsed),
                cumulativeGasUsed: parseFloat(cumulativeGasUsed),
                hash
            };
        } catch (err) {
            failed++;
            return null;
        }
    }));
    if (failed) console.log(`Failed to parse ${failed} TX's`);
    const filtered = data.filter(x => x);
    const maxGas = _.maxBy(data, 'gasPrice').gasPrice /1e9;
    const minGas = _.minBy(data, 'gasPrice').gasPrice /1e9;
    const averageGas = _.meanBy(data,'gasPrice');
    const averageGasHuman = averageGas / 1e9;
    const totalGas = _.sumBy(data, 'gasUsed');
    const ethSent = _.sumBy(data, 'value');
    const ethSentHuman = ethSent / 1e18;
    return {txData: filtered, averageGas, averageGasHuman, ethSent, ethSentHuman, failed,
        totalGas, maxGas, minGas};
}

const parseBlock = async (blockheight) => {
    const block = await provider.getBlock(blockheight);
    const {gasLimit, gasUsed} = block;
    const percentFull = gasUsed / gasLimit;
    const numTx = block.transactions.length;
    // const test2 = await provider.getTransactionReceipt('0xd38b2d4b0aaa5424d41ce165c260eeccd062e5101f0f9c00380aa472a2a8f932');
    // console.log(test2)
    // const test = await provider.getTransaction('0xd38b2d4b0aaa5424d41ce165c260eeccd062e5101f0f9c00380aa472a2a8f932');
    // console.log(test)
    const {txData, averageGas, maxGas, minGas, averageGasHuman, ethSent, ethSentHuman, failed, totalGas, totalGasHuman} = await parseTXs(block.transactions)
    const avgGasPerTx = gasUsed / numTx;
    const information = {
        BLOCK: blockheight,
        totalGas,
        GAS_USED: parseFloat(gasUsed),
        BLOCK_PERCENT_FULL: percentFull * 100,
        NUM_TXS: numTx,
        AVERAGE_GAS_PRICE: averageGasHuman,
        TOTAL_ETH_SENT: ethSentHuman,
        ACCURACY: 100 * (1 - (failed / block.transactions.length)),
        maxGas, averageGas, minGas, averageGasHuman, txData
    };
    updateUI(information, clc.yellow('   Polling for new blocks'))
    return 'ok;'
}
const main = async () => {
    const blockheight = await provider.getBlockNumber();
    if (blockheight > currentblock) {
        updateUI(lastData, clc.yellow.bold(`   New Block #${blockheight} found!`))
        parseBlock(blockheight);
        counter=0;
        currentblock = blockheight;
    }else{
        counter++;
        const spinner = ['.','..','...'];
        updateUI(lastData, clc.yellow(`   Polling for new blocks ${spinner[counter % 3]}`));
    }
    await sleep(500);
    main();
}

const validator = async () => {
    const data = await fetch(`https://beaconcha.in/api/v1/validator/${validatorAddress}/attestations`);
    const json = await data.json();
    validatorData = json.data;
    updateUI();
    await sleep(30000);
    validator();
}

main();
fetchQueue();
if(validatorAddress) validator()
