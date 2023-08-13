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

async function main() {

    mevShare.on('transaction', async ( pendingTx: IPendingTransaction ) => {
        console.log(pendingTx)
    })

    // mevShare.on('bundle', async ( pendingTx: IPendingTransaction ) => {
    //     // callback to handle pending bundle
    //     console.log(pendingTx)
    // })
}

main()