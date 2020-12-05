const ethers = require('ethers');
const provider = new ethers.providers.JsonRpcProvider();
const _ = require('lodash');
const CLI = require('clui'),
    clc = require('cli-color'),
    clear = require('clear');

let currentblock = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let counter = 0;
let lastData;
const updateUI = async (data = lastData, update) => {
    if(!data) return;
    lastData = data;
    clear();
    const {BLOCK_PERCENT_FULL, BLOCK,NUM_TXS, TOTAL_ETH_SENT, maxGas, averageGasHuman, minGas} = data;
    const min = clc.green(Math.round(minGas*100)/100);
    const avg = clc.yellow(Math.round(averageGasHuman*100)/100);
    const max = clc.red(Math.round(maxGas*100)/100);
    console.log('');
    const line1 = `   ${clc.green('Block Height: \t\t')} ${clc.yellow.bold(BLOCK)}`;
    const line2 = `   ${clc.green('Block Gas Limit Used:')} \t ${CLI.Gauge(BLOCK_PERCENT_FULL, 100, 20, 100, `${BLOCK_PERCENT_FULL.toString().substring(0, 5)} % \t`)}`;
    const line3 = `   ${clc.green('Gas Price [min, avg, max]:')} \t [ ${min} , ${avg} , ${max} ]`;
    const line4 = `   There was ${clc.green(TOTAL_ETH_SENT)} ETH sent in ${clc.green(NUM_TXS)} Transactions`;
    console.log(line1);
    console.log(line2);
    console.log('')
    console.log(line3);
    console.log('')
    console.log(line4);
    console.log('')
    console.log(update)
    console.log('')

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
    const {averageGas, maxGas, minGas, averageGasHuman, ethSent, ethSentHuman, failed, totalGas, totalGasHuman} = await parseTXs(block.transactions)
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
        maxGas, averageGas, minGas, averageGasHuman
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
        // let dots = ''
        // let i = 0;
        // while(i < counter % 4){
        //     i++;
        //     dots += '.';
        // }
        updateUI(lastData, clc.yellow(`   Polling for new blocks ${spinner[counter % 3]}`));
    }
    await sleep(500);
    main();
}

main();
