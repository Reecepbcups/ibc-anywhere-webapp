


<script lang="ts">   
    import type { Window as KeplrWindow } from "@keplr-wallet/types";

    // load stargate client from cosmjs
    // import { StargateClient } from "@cosmjs/stargate";     
    // import type {OfflineSigner} from "@cosmjs/proto-signing";         
    import type { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";

        
    import { SigningStargateClient } from "@cosmjs/stargate";
        
    import { assets, chains, ibc } from 'chain-registry';
    import type { IBCInfo } from '@chain-registry/types';

        
    // Q: Why does this not work? only returns 0->20 max, not the 45+     
    // let final: any[] = [];
    // for(const info of ibc) {
    //     if(info.chain_1.chain_name === "osmosis") {
    //         final = [...final, info]
    //     }
    // }
    // console.log(final)

    let chain_input: String;
    let to_chain_input: String;
    let users_balances: Coin[] = [];

    // let enabled_channels: string[] = []; // set when we load the users first wallet, this way we only show exacts

    const channel_version: String = "ics20-1";
    const port_id: String = "transfer";
    let gas = 250000;

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
        
        
        
        // try 10 different endpoints
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
            throw new Error("Client not found")
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

    // This returns idx 0->20 max, why?
    // osmosis has a cosmoshub channel, but not found here
    const get_all_channels = (chain_name: String) => {
        // does this need to be async?
        let channels: IBCInfo[] = []        
        for(const channel of ibc) {
            if(channel.chain_1.chain_name === chain_name) {
                channels = [...channels, channel]
            }
        }
        return channels
    }

    const get_channel = async (from_name: String, to_name: String, version: String, port_id: String) => {
        // version example: ics20-1
        // see if the from chainid has a matching to_chainid from in the ibc variable                
        for(const info of get_all_channels(from_name)) {            
            if(info.chain_2.chain_name === to_name) {                                                      
                for(const channel of info.channels) {
                    if(channel.version === version && channel.chain_1.port_id === port_id) {
                        return channel.chain_1.channel_id
                    }                
                }
            }
        }
        return undefined
    }

    // get_channel("cosmoshub", "osmosis", "ics20-1", "transfer").then((channel) => {
    //     console.log(channel)
    // })    
    // get_channel("osmosis", "cosmoshub", "ics20-1", "transfer").then((channel) => {
    //     console.log(channel)
    // })    

    // const all = get_all_channels("osmosis")    
    // console.log(all)

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

        // const client = await SigningStargateClient.connectWithSigner(chain_rpc[0].address, wallet, {prefix: chain.bech32_prefix})

        // client.sendTokens(addr, addr, [{denom: "uatom", amount: "100"}], {amount: [], gas: "500000"}).then((tx) => {
        //     console.log(tx)
        // });
        

        

        // get current time in seconds
        const current_time = Math.floor(Date.now() / 1000)        
        const timeout_time = current_time + 100

        const channel_id = await get_channel(chain.chain_name, to_chain.chain_name, channel_version, port_id) // ex: channel-141
        if(channel_id === undefined) {
            alert(`There is no IBC channel for ${chain.chain_name} -> ${to_chain.chain_name} with version ${channel_version} and port_id ${port_id}`)
            throw new Error("Channel not found")
        }
        // console.log(channel_id)

        // alert here that they are going to do XYZ for XYZ, allow gas change price, then send

        if(from_client === undefined) {
            throw new Error("from_client not found")
        }

        from_client.sendIbcTokens(addr, to_wallet_addr, {denom: ibc_denom, amount: ibc_amount.toString()}, "transfer", channel_id, undefined, timeout_time, {amount: [], gas: gas.toString()}, "IBC-Anywhere by Reece").then((tx) => {
            console.log(tx)
            // popup a little green modle here in the future

            alert(`Transaction submited, Code: ${tx.code} Tx: ${tx.transactionHash} (also in console)`)
        });
    }
</script>


<!-- button which calls connectToChain -->
<!-- <button on:click={connectToChain}>Connect to Chain</button> -->

<!-- <h1>{chain_input} -> {to_chain_input}</h1> -->

<h1>IBC Anywhere</h1>

<!-- async, for chain in chains output it as a p -->
{#await chains}
    <p>loading...</p>
{:then chains}
    <!-- {#each chains as chain}
        <li>{chain.pretty_name}</li>
    {/each} -->

    <!-- an input drop down and text box which auto fills to the values in chains.pretty_name.lower() --> 
    
    <h4>From Chain</h4>
    <input type="text" placeholder="from chain-id" list="chain_names" bind:value={chain_input}>       
    <br>
    <input id="gasAmount" type="number" placeholder="Gas Amount" step="100" pattern="\d*" bind:value={gas}> gas    
    
    <!-- Connects the wallet to the current chain, then we will show the user more information. -->
    <br>
    <input type="submit" value="Connect Wallet" on:click={() => connect_wallet_get_balances()}>

    <!-- li of users_balances -->
    <ul>
        {#each users_balances as balance}
        <!-- if denom starts with ibc/, we need to decode the ibc-trace -->
            <!-- {#if } -->
            <li>{balance.amount} {balance.denom}</li>
        {/each}
    </ul>

    <!-- datalist of users_balances -->
    <datalist id="denoms">
        {#each users_balances as balance}
            <option value={balance.denom}>{balance.denom}</option>
        {/each}
    </datalist>

    <div id="denoms_to_send" style="display: none;">
        <input type="text" placeholder="Denom to send" list="denoms" bind:value={ibc_denom}>
        <input type="number" placeholder="Amount" bind:value={ibc_amount}>

        <h4>To Chain</h4>
        <input type="text" placeholder="to chain-id" list="chain_names" bind:value={to_chain_input}>
        <input type="submit" on:click={() => ibc_transfer()}>
    </div>

        
    <!-- <input type="text" placeholder="Tokens To Send" list="" bind:value={}>          -->
    <!-- <input type="submit" on:click={() => connectToChain()}> -->


    <!-- a submit button or when they press enter, connect to keplr function, passing through the input from the text box above-->    
        
    <datalist id="chain_names">
        {#each chains as chain}
            <!-- make the value the chain id? -->
            <option value={chain.chain_id}>{chain.pretty_name}</option> 
        {/each}
    </datalist>        
{/await}

 <!-- requests keplr connection -->
<!-- <button on:click={connectKeplr}>Connect to Keplr</button> -->


<!-- <h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p> -->
