import MevShareClient, {
    BundleParams,
    HintPreferences,
    IPendingBundle,
    IPendingTransaction,
    TransactionOptions
} from "@flashbots/mev-share-client"
import { Contract, JsonRpcProvider, Wallet, keccak256, getCreate2Address } from 'ethers'
import { MevShareCTFNewContracts_ABI } from './abi'

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

const MevShareCTFNewContracts_ADDRESS = "0x5eA0feA0164E5AA58f407dEBb344876b5ee10DEA"
const mevShareCTFNewContracts = new Contract(MevShareCTFNewContracts_ADDRESS, MevShareCTFNewContracts_ABI, signer)

function transactionIsRelevant(pendingTx: IPendingTransaction, PAIR_ADDRESS: string) {
    return ((pendingTx.logs || []).some(log => log.address === MevShareCTFNewContracts_ADDRESS.toLowerCase())) &&
           ((pendingTx.logs || []).some(log => log.data[2] === '0'))
}

async function getSignedBackrunTx(nonce: number, pendingTx: IPendingTransaction) {
    const newContractAddress = "0x" + (pendingTx.logs || [])[0].data.slice(-40)
    console.log("newContractAddress: ", newContractAddress)
    const newContract_ABI = [
        "function claimReward() external"
    ]
    const newContract = new Contract(newContractAddress, newContract_ABI, signer)
    const backrunTx = await newContract.claimReward.populateTransaction({from: signer.address})
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

async function backrunAttempt( currentBlockNumber: number, nonce: number, pendingTxHash: string, pendingTx: IPendingTransaction) {
    const backrunSignedTx = await getSignedBackrunTx(nonce, pendingTx)
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

        if (transactionIsRelevant(pendingTx, MevShareCTFNewContracts_ADDRESS)) {
            console.log(pendingTx)
            const currentBlockNumber = await provider.getBlockNumber()
            const nonce = await signer.getNonce('latest')
            backrunAttempt(currentBlockNumber, nonce, pendingTx.hash, pendingTx);
        }
    })
}

main()