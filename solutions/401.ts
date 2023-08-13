import MevShareClient, {
    BundleParams,
    HintPreferences,
    IPendingBundle,
    IPendingTransaction,
    TransactionOptions
} from "@flashbots/mev-share-client"
import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { MevShareCTFTriple_ABI } from './abi'

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

const MevShareCTFTriple_ADDRESS = "0x1eA6Fb65BAb1f405f8Bdb26D163e6984B9108478"
const mevShareCTFTriple = new Contract(MevShareCTFTriple_ADDRESS, MevShareCTFTriple_ABI, signer)

function transactionIsRelevant(pendingTx: IPendingTransaction, PAIR_ADDRESS: string) {
    return ((pendingTx.logs || []).some(log => log.address === MevShareCTFTriple_ADDRESS.toLowerCase()))
}

async function getSignedBackrunTx(nonce: number) {
    const backrunTx = await mevShareCTFTriple.claimReward.populateTransaction({from: signer.address})
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

async function backrunAttempt( currentBlockNumber: number, nonce: number, pendingTxHash: string) {
    const backrunSignedTx1 = await getSignedBackrunTx(nonce)
    const backrunSignedTx2 = await getSignedBackrunTx(++nonce)
    const backrunSignedTx3 = await getSignedBackrunTx(++nonce)
    try {
        const sendBundleResult = await mevShare.sendBundle({
            inclusion: { block: currentBlockNumber + 1 },
            body: [
                { hash: pendingTxHash },
                { tx: backrunSignedTx1, canRevert: false },
                { tx: backrunSignedTx2, canRevert: false },
                { tx: backrunSignedTx3, canRevert: false }
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

        if (transactionIsRelevant(pendingTx, MevShareCTFTriple_ADDRESS)) {
            console.log(pendingTx)
            const currentBlockNumber = await provider.getBlockNumber()
            const nonce = await signer.getNonce('latest')
            backrunAttempt(currentBlockNumber, nonce, pendingTx.hash);
        }
    })
}

main()