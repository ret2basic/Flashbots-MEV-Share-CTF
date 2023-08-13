import MevShareClient, {
    BundleParams,
    HintPreferences,
    IPendingBundle,
    IPendingTransaction,
    TransactionOptions
} from "@flashbots/mev-share-client"
import { Contract, JsonRpcProvider, Wallet, keccak256, getCreate2Address } from 'ethers'
import { MevShareCTFNewContracts_ABI, newContract_ABI } from './abi'

import dotenv from "dotenv"
dotenv.config()

const TX_GAS_LIMIT = 400000
const MAX_GAS_PRICE = 2000n
const MAX_PRIORITY_FEE = 2000n
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
           ((pendingTx.logs || []).some(log => log.data[2] !== '0')) &&
           ((pendingTx.logs || []).some(log => log.data[3] !== '0')) &&
           ((pendingTx.logs || []).some(log => log.data[4] !== '0'))
}

async function getSignedBackrunTx(nonce: number, pendingTx: IPendingTransaction) {
    const salt = (pendingTx.logs || [])[0].data
    console.log("salt:", salt)
    const initCode = "0x60a060405233608052436000556080516101166100266000396000606f01526101166000f3fe6080604052348015600f57600080fd5b506004361060325760003560e01c806396b81609146037578063b88a802f146051575b600080fd5b603f60005481565b60405190815260200160405180910390f35b60576059565b005b4360005414606657600080fd5b600080819055507f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031663720ecf456040518163ffffffff1660e01b8152600401600060405180830381600087803b15801560c757600080fd5b505af115801560da573d6000803e3d6000fd5b5050505056fea26469706673582212207a00db890eff47285ac0d9c9b8735727d476952aa87b45ee82fd6bb4f42c6fa764736f6c63430008130033"
    const initCodeHash = keccak256(initCode)
    const newContractAddress = getCreate2Address(MevShareCTFNewContracts_ADDRESS, salt, initCodeHash)
    console.log("newContractAddress: ", newContractAddress)
    const newContract = new Contract(newContractAddress, newContract_ABI, signer)
    const backrunTx = await newContract.claimReward.populateTransaction()
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