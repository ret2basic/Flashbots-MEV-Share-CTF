import MevShareClient, {
    BundleParams,
    HintPreferences,
    IPendingBundle,
    IPendingTransaction,
    TransactionOptions
} from "@flashbots/mev-share-client"
import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { MevShareCTFSimple_ABI } from './abi'

import dotenv from "dotenv"
dotenv.config()

const TX_GAS_LIMIT = 400000
const MAX_GAS_PRICE = 20n
const MAX_PRIORITY_FEE = 20n
const GWEI = 10n ** 9n

const RPC_URL = process.env.RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY || Wallet.createRandom().privateKey

const provider = new JsonRpcProvider(RPC_URL)
const signer = new Wallet(PRIVATE_KEY, provider)
const mevShare  = MevShareClient.useEthereumGoerli(signer)

const MevShareCTFSimple_ADDRESS = "0x20a1a5857fdff817aa1bd8097027a841d4969aa5"
const mevShareCTFSimple = new Contract(MevShareCTFSimple_ADDRESS, MevShareCTFSimple_ABI, signer)

function transactionIsRelevant(pendingTx: IPendingTransaction, PAIR_ADDRESS: string) {
    return pendingTx.to === MevShareCTFSimple_ADDRESS.toLowerCase() ||
        ((pendingTx.logs || []).some(log => log.address === MevShareCTFSimple_ADDRESS.toLowerCase())) ||
        (pendingTx.logs === undefined && pendingTx.to === null && pendingTx.gasUsed === 30000n)
}

async function getSignedBackrunTx(nonce: number ) {
    const backrunTx = await mevShareCTFSimple.claimReward.populateTransaction()
    const backrunTxFull = {
        ...backrunTx,
        chainId: 5,
        maxFeePerGas: MAX_GAS_PRICE * GWEI,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE * GWEI,
        gasLimit: TX_GAS_LIMIT,
        nonce: nonce
    }
    return signer.signTransaction(backrunTxFull)
}

async function backrunAttempt( currentBlockNumber: number, nonce: number, pendingTxHash: string ) {
    const backrunSignedTx = await getSignedBackrunTx(nonce)
    try {
        const sendBundleResult = await mevShare.sendBundle({
            inclusion: { block: currentBlockNumber + 1 },
            body: [
                { hash: pendingTxHash },
                { tx: backrunSignedTx, canRevert: false }
            ]
        },)
        console.log('Bundle Hash: ' + sendBundleResult.bundleHash)
    } catch (e) {
        console.log('Error: ', e)
    }
}

async function main() {

    mevShare.on('transaction', async ( pendingTx: IPendingTransaction ) => {
        // console.log(pendingTx)

        if (transactionIsRelevant(pendingTx, MevShareCTFSimple_ADDRESS)) {
            console.log(pendingTx)
            const currentBlockNumber = await provider.getBlockNumber()
            const nonce = await signer.getNonce('latest')
            backrunAttempt(currentBlockNumber, nonce, pendingTx.hash);
        }
    })
}

main()