const ethers = require('ethers');
const provider = new ethers.providers.JsonRpcProvider();
const _ = require('lodash');

const parseTXs = async (txs) => {
    let failed = 0;
    const data = await Promise.all(txs.map(async (tx) => {
        try {
            const {gasPrice, gasLimit, from, to, value, hash} = await provider.getTransaction(tx);
            return {
                gasPrice: parseFloat(gasPrice),
                gasLimit: parseFloat(gasLimit), from, to,
                value: parseFloat(value),
                hash
            };
        } catch (err) {
            failed++;
            return null;
        }
    }));
    if (failed) console.log(`Failed to parse ${failed} TX's`);
    const filtered = data.filter(x => x);
    console.log(_.sumBy(data, 'gasPrice'));
    const averageGas = _.sumBy(data, 'gasPrice') / data.length;
    const averageGasHuman = averageGas / 1e9;
    const ethSent = _.sumBy(data, 'value');
    const ethSentHuman = ethSent / 1e18;
    console.log({averageGas, averageGasHuman, ethSent, ethSentHuman});
    return {txData: filtered, averageGas, averageGasHuman, ethSent, ethSentHuman, failed };
}
const main = async () => {
    const blockheight = await provider.getBlockNumber();
    const block = await provider.getBlock(blockheight);
    const {gasLimit, gasUsed} = block;
    const percentFull = gasUsed / gasLimit;
    const numTx = block.transactions.length;
    // const test = await provider.getTransaction('0xd38b2d4b0aaa5424d41ce165c260eeccd062e5101f0f9c00380aa472a2a8f932');
    // console.log(test)
    const {averageGas, averageGasHuman, ethSent, ethSentHuman, failed} = await parseTXs(block.transactions)
    const avgGasPerTx = gasUsed / numTx;
    console.log({
        BLOCK_PERCENT_FULL: percentFull * 100,
        NUM_TXS: numTx,
        AVERAGE_GAS_PRICE: averageGasHuman,
        TOTAL_ETH_SENT: ethSentHuman,
        ACCURACY: `${100*(1-(failed/block.transactions.length))} %`,
    })
}

main();
