import MevShareClient, {
    BundleParams,
    HintPreferences,
    IPendingBundle,
    IPendingTransaction,
    TransactionOptions
} from "@flashbots/mev-share-client"
import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { mevShareCTFMagicNumber_ABI } from './abi'

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

const MevShareCTFMagicNumber_ADDRESS = "0x9BE957D1c1c1F86Ba9A2e1215e9d9EEFdE615a56"
const mevShareCTFMagicNumber = new Contract(MevShareCTFMagicNumber_ADDRESS, MevShareCTFMagicNumber_ABI, signer)

function transactionIsRelevant(pendingTx: IPendingTransaction, PAIR_ADDRESS: string) {
    return ((pendingTx.logs || []).some(log => log.address === MevShareCTFMagicNumber_ADDRESS.toLowerCase()))
}

async function getSignedBackrunTx(nonce: number , _magicNumber: Number) {
    const backrunTx = await mevShareCTFMagicNumber.claimReward.populateTransaction(_magicNumber, {from: signer.address})
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

async function backrunAttempt( currentBlockNumber: number, nonce: number, pendingTxHash: string, _magicNumber: Number ) {
    const backrunSignedTx = await getSignedBackrunTx(nonce, _magicNumber)
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

        if (transactionIsRelevant(pendingTx, MevShareCTFMagicNumber_ADDRESS)) {
            console.log(pendingTx)
            const currentBlockNumber = await provider.getBlockNumber()
            const nonce = await signer.getNonce('latest')
            const dataOne = "0x" + (pendingTx.logs || [])[0].data.slice(-14)
            const dataTwo = "0x" + (pendingTx.logs || [])[0].data.slice(-78, -64)

            let lowerBound
            let upperBound

            if (dataOne < dataTwo) {
                lowerBound = dataOne
                upperBound = dataTwo
            }
            else {
                upperBound = dataOne
                lowerBound = dataTwo
            }

            console.log("upperBound: ", upperBound)
            console.log("lowerBound: ", lowerBound)

            const upperBoundDecimal = Number(upperBound)
            const lowerBoundDecimal = Number(lowerBound)

            console.log("upperBoundDecimal: ", upperBoundDecimal)
            console.log("lowerBoundDecimal: ", lowerBoundDecimal)

            for (let magicNumber = lowerBoundDecimal; magicNumber <= upperBoundDecimal; magicNumber++) {
                backrunAttempt(currentBlockNumber, nonce, pendingTx.hash, magicNumber);
            }
        }
    })
}

main()