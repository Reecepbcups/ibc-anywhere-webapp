


<script lang="ts">   
    import type { Window as KeplrWindow } from "@keplr-wallet/types";

    // load stargate client from cosmjs
    // import { StargateClient } from "@cosmjs/stargate";     
    // import type {OfflineSigner} from "@cosmjs/proto-signing";         
    import type { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";

        
    import { SigningStargateClient } from "@cosmjs/stargate";
        
    // https://github.com/cosmology-tech/chain-registry/blob/main/packages/assets/src/asset_lists.ts
    import { assets, chains, ibc } from 'chain-registry';            
    import type { IBCInfo } from '@chain-registry/types';

    let chain_input: string;
    let to_chain_input: string;
    let users_balances: Coin[] = [];

    const channel_version: string = "ics20-1";
    const port_id: string = "transfer";
    let gas = 300000;

    let ibc_denom: string;
    let ibc_amount: number;    

    // let from_chain: OfflineSigner;

    let from_client: SigningStargateClient | undefined;
    
    // async function connectToChain
    const connect_wallet_get_balances = async () => {
        if(chain_input === undefined) {
            alert(`From chain not selected`)
            throw new Error("Chain not found")
        }

        // const chain_id = "cosmoshub-4"        
        const chain = chains.find(chain => chain.chain_id === chain_input)

        if(chain === undefined) {
            throw new Error("Chain not found")
        }
        
        const chain_rpc = chain.apis?.rpc
        if(chain_rpc === undefined) {
            throw new Error("Chain RPC not found")
        }

        // open keplr
        const keplr = (window as KeplrWindow)
        if(keplr === undefined) {
            throw new Error("Keplr not found")
        }
        
        let signer = keplr.getOfflineSigner
        if(signer === undefined) {
            throw new Error("Keplr not found")
        }
        
        const wallet = signer(chain.chain_id)
        wallet.getAccounts().then((accounts) => {
            console.log('accounts', accounts)
        })            
        
        
        
        // try 10 different endpoints max
        for(let i = 0; i < 10; i++) {
            try {            
                from_client = await SigningStargateClient.connectWithSigner(chain_rpc[i].address, wallet, {prefix: chain.bech32_prefix})  
                await from_client.getAllBalances((await wallet.getAccounts())[0].address) // ensures it works correctly      
                break
            } catch (error) {
                // cors
                console.log(error)
            }
        }      
        
        if(from_client === undefined) {
            throw new Error("RPC with CORS not found, Client can not be created")
        }
        
        // get the from balance of addr    
        // assign read only from await client.getAllBalances(addr) to user_balancecs Coin[]
        const balances = await from_client.getAllBalances((await wallet.getAccounts())[0].address)
        // console.log(balances)

        // set the global users_balances to balances
        let new_balances: Coin[] = []
        for (const balance of balances) {
            new_balances.push(balance)
        }
        users_balances = new_balances
        console.log(users_balances)

        // set the id of denoms_to_send to display show
        document.getElementById("denoms_to_send")!.style.display = "block";
    }
    
    interface Channel {
        name: string,
        channel_id: string,
        version: string, // ics20-1
        port_id: string // transfer
    }    

    const get_all_channel_pairs = (from_name: string): Channel[] => {
        const matches: Channel[] = []

        for(const channel of ibc) {
            const c = channel.channels[0] // why channel 0
            
            if(channel.chain_1.chain_name === from_name) {
                matches.push({
                    name: channel.chain_2.chain_name,           
                    channel_id: c.chain_1.channel_id,
                    port_id: c.chain_1.port_id,
                    version: c.version
                })
            } else if (channel.chain_2.chain_name === from_name) {
                matches.push({
                    name: channel.chain_1.chain_name,           
                    channel_id: c.chain_2.channel_id,
                    port_id: c.chain_2.port_id,
                    version: c.version
                })
            }
        }        
        return matches
    }

    // get_all_channel_pairs("cosmoshub")

    const get_channel = (from_name: string, to_name: string): string => {
        const pairs = get_all_channel_pairs(from_name)

        // todo; add version & port_id in the future
        
        for(const pair of pairs) {
            if(pair.name === to_name) {
                return pair.channel_id
            }
        }

        return "";
    }

    const ibc_transfer = async () =>  {
        // use sendIbcTokens from stargate client
        // const chain_id = "cosmoshub-4"
        const chain = chains.find(chain => chain.chain_id === chain_input)
        if(chain === undefined) {
            alert(`From chain ${chain_input} not found`)
            throw new Error("Chain not found")
        }

        // const to_chain_id = "osmosis-1"
        const to_chain = chains.find(chain => chain.chain_id === to_chain_input)
        if(to_chain === undefined) {
            alert(`To chain ${to_chain_input} not found`)
            throw new Error("Chain not found")
        }

        let chain_rpc = chain.apis?.rpc
        let to_chain_rpc = to_chain.apis?.rpc        
        if(chain_rpc === undefined || to_chain_rpc === undefined) {
            throw new Error("Chain RPC not found")
        }        
        
        const keplr = (window as KeplrWindow)
        if(keplr === undefined) {
            throw new Error("Keplr not found")
        }
        
        let signer = keplr.getOfflineSigner
        if(signer === undefined) {
            throw new Error("Keplr not found")
        }        

        const wallet = signer(chain.chain_id)
        const addr = (await wallet.getAccounts())[0].address        

        const to_wallet = signer(to_chain.chain_id)
        const to_wallet_addr = (await to_wallet.getAccounts())[0].address        

        // get current time in seconds
        const current_time = Math.floor(Date.now() / 1000)        
        const timeout_time = current_time + 100


        const channel_id = get_channel(chain.chain_name, to_chain.chain_name) // ex: channel-141
        if(channel_id === undefined || channel_id === "") {
            alert(`There is no IBC channel for ${chain.chain_name} -> ${to_chain.chain_name} with version ${channel_version} and port_id ${port_id}`)
            throw new Error("Channel not found")
        }        

        // alert here that they are going to do XYZ for XYZ, allow gas change price, then send

        if(from_client === undefined) {
            throw new Error("from_client not found")
        }

        // ensuere ibc_denom ibc_amount is not > balances
        for(const balance of users_balances) {
            if(balance.denom === ibc_denom) {
                if(Number(balance.amount) < ibc_amount) {
                    alert(`You do not have enough\n${ibc_denom} to send\n${ibc_amount}`)
                    throw new Error("Not enough balance")
                }
            }
        }

        from_client.sendIbcTokens(addr, to_wallet_addr, {denom: ibc_denom, amount: ibc_amount.toString()}, port_id, channel_id, undefined, timeout_time, {amount: [], gas: gas.toString()}, `IBC-Anywhere by Reece | from ${chain.pretty_name} to ${to_chain.pretty_name}`).then((tx) => {
            console.log(tx)
            // popup a little green modle here in the future
            alert(`Transaction submited, Code: ${tx.code} Tx: ${tx.transactionHash} (also in console)`)
        });
    }
</script>


<h1>IBC Anywhere</h1>
<p>Easily IBC token transfer from and to any chain in 5 clicks  (<a href="https://twitter.com/Reecepbcups_" target="noreferrer">Get Support</a>)</p>

<!-- async, for chain in chains output it as a p -->
{#await chains}
    <p>loading...</p>
{:then chains}

     <!-- datalist of users_balances -->
     <datalist id="denoms">
        {#each users_balances as balance}
            <option value={balance.denom}>{balance.denom}</option>
        {/each}
    </datalist>

    <!-- chain names & match with chain_id value -->
    <datalist id="chain_names">
        {#each chains as chain}            
            <option value={chain.chain_id}>{chain.pretty_name}</option> 
        {/each}
    </datalist>  
     <!-- code -->

     <center>
        <div id="from_chain" class="div_center"> 

            <h3>From Chain</h3>
            <input id="chain_input" type="text" placeholder="from chain-id" list="chain_names" bind:value={chain_input}>       
            <br>
            <!-- <input id="gasAmount" type="number" placeholder="Gas Amount" step="100" pattern="\d*" bind:value={gas}> gas     -->
            
            <!-- Connects the wallet to the current chain, then we will show the user more information. -->
            <br>
            <input type="submit" value="Connect Wallet" on:click={() => connect_wallet_get_balances()}>        
        </div>
    
        
    
        <div id="denoms_to_send" style="display: none;" class="div_center">   
    
            <!-- li of users_balances -->
            <h3>balances</h3>
            <ul>
                {#each users_balances as balance}
                <!-- if denom starts with ibc/, we need to decode the ibc-trace -->
                    <!-- {#if } -->
                    <li>{balance.amount} {balance.denom}</li>
                {/each}
            </ul>
                         
            <input type="number" placeholder="Amount" bind:value={ibc_amount}>
            
            <!-- create a select input box of list denoms -->        
            <select bind:value={ibc_denom}>            
                <option value="" disabled selected>Select a Denom</option>
                {#each users_balances as balance, i}                
                    <option value={balance.denom}>{balance.denom}</option>
                {/each}
            </select>
    
            <h4>To Chain</h4>
            <input type="text" placeholder="to chain-id" list="chain_names" bind:value={to_chain_input}>            
            <input type="submit" on:click={() => ibc_transfer()}>
        </div>
     </center>

     

            
         
{/await}

<style>
    h1, p {
        text-align: center;
    }
       
    .div_center {
        border: 1px solid black;
        padding: 10px;
        margin: 10px;
        max-width: 50%;
        float: none !important; 
        text-align: center;        
    }    

    ul {
        list-style: none;        
    }

    li {                        
        margin: 10px;
    }

    /* make buttons green, with larger text */
    input[type=submit] {
        background-color: #4CAF50;
        color: white;
        padding: 16px 32px;
        text-align: center;
        text-decoration: none;
        display: inline-block;
        font-size: 16px;
        margin: 4px 2px;
        cursor: pointer;        
        border-radius: 8px;
    }
    
    input[type=text], input[type=number], select {
        width: 25%;
        padding: 12px 20px;
        margin: 8px 0;
        display: inline-block;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-sizing: border-box;        
    }    

</style>