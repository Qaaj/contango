const ethers = require('ethers');
const provider = new ethers.providers.JsonRpcProvider();
const _ = require('lodash');

let currentblock = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseTXs = async (txs) => {
    let failed = 0;
    const data = await Promise.all(txs.map(async (tx,i) => {
        await sleep(i*2); // Don't hammer the node
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
    const averageGas = _.sumBy(data, 'gasPrice') / data.length;
    const averageGasHuman = averageGas / 1e9;
    const totalGas = _.sumBy(data, 'gasUsed');
    const ethSent = _.sumBy(data, 'value');
    const ethSentHuman = ethSent / 1e18;
    return {txData: filtered, averageGas, averageGasHuman, ethSent, ethSentHuman, failed, totalGas };
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
    const {averageGas, averageGasHuman, ethSent, ethSentHuman, failed, totalGas, totalGasHuman} = await parseTXs(block.transactions)
    const avgGasPerTx = gasUsed / numTx;
    console.log({
        BLOCK: blockheight,
        totalGas,
        GAS_USED: parseFloat(gasUsed),
        BLOCK_PERCENT_FULL: percentFull * 100,
        NUM_TXS: numTx,
        AVERAGE_GAS_PRICE: averageGasHuman,
        TOTAL_ETH_SENT: ethSentHuman,
        ACCURACY: 100*(1-(failed/block.transactions.length)),
    })
    return 'ok;'
}
const main = async () => {
    const blockheight = await provider.getBlockNumber();
    if(blockheight > currentblock){
        parseBlock(blockheight);
        currentblock = blockheight;
    }
    await sleep(1000);
    main();
}

main();
