<!-- 
    Reece Williams | Dec 2022 | IBCAnywhere
    - Easily transfer a token denom from one chain to another in 5 clicks
    - Abstracts away the complexity of channels for the average user    

    TODO:
    - Only show channels for the to-chain which from-chain has a connection too
    - Dockerize
    - Remove redundant code, such as the open keplr window. Make easy utils
    - Better design. animations?
    - Auto convert IBC denoms to their human readable versions, including exponents
    - Mobile Support
-->
<script lang="ts">
	import type { Window as KeplrWindow } from '@keplr-wallet/types';

	import type { Coin } from 'cosmjs-types/cosmos/base/v1beta1/coin';
	import { SigningStargateClient } from '@cosmjs/stargate';

	// Signing (Keplr & Ledger)
	import type { OfflineAminoSigner } from '@cosmjs/amino';
	import type { OfflineDirectSigner } from '@cosmjs/proto-signing';

	// ibc balances
	import { Tendermint34Client } from '@cosmjs/tendermint-rpc';
	import { setupIbcExtension, QueryClient } from '@cosmjs/stargate';
	import type { DenomTrace } from '@cosmjs/stargate/node_modules/cosmjs-types/ibc/applications/transfer/v1/transfer';
	import type {IbcExtension} from '@cosmjs/stargate/build/modules/ibc/queries';

	// notifications
	import toast, { Toaster, type ToastOptions } from 'svelte-french-toast';    	

	// https://github.com/cosmology-tech/chain-registry/blob/main/packages/assets/src/asset_lists.ts	
	// Can't find module even though its the same for the fork?
	import { assets, chains, ibc } from '../chain-registry';

	// This does not work for Failed to load url?
	// import assets from '../../node_modules/chain-registry/packages/chain-registry/types/assets';	
	// import chains from '../../node_modules/chain-registry/packages/chain-registry/types/chains';
	// import ibc from '../../node_modules/chain-registry/packages/chain-registry/types/ibc';

	// Since RPCs are Ass, force use mine which ACTUALLY HAS CORS ENABLED AND LETS ME DEVELOP
	const JUNO_RPC = "https://juno-rpc.reece.sh"
	const CANTO_RPC = "https://canto-rpc.reece.sh"

	let divisor = 10**6;
	let toggle_divisor = () => {
		 // converts utoken to token, can we get this from an IBC asset denom? 10**6 breaks ETH based assets
		if(divisor === 10**6) {
			divisor = 1;
		} else {
			divisor = 10**6;
		}
	}

	const toast_style: ToastOptions = {
		position: 'top-right',
		duration: 6000,
		style: 'background: #333; color: #fff; width: 15%; font-size: 1.1rem;'
	};    

	interface Balance {
		denom: string; // human readable (ex: uosmo)
		symbol: string // human readable WITHOUT the u (ex: osmo)
		amount: string;
		ibc_trace?: string; // ibc/
		channel?: string;
		// chain_id?: string; // this possible to get from channel-number?
	}

	let chain_input: string;
	let to_chain_input: string;
	
	let balances: Balance[] = [];

	const channel_version: string = 'ics20-1';
	const port_id: string = 'transfer';
	let gas = 300000;

	let ibc_denom: string;
	let ibc_amount: number;

	let from_client: SigningStargateClient | undefined;
	
	const proper_rpcs = (chain_id: string, chain_rpc: any) => {		
		let rpcs: any;
		if(chain_id === "juno-1") {
			rpcs = [{address: JUNO_RPC}, {address: "https://rpc.juno.strange.love/"}, ...chain_rpc]
		} else if (chain_id === "canto_7700-1") {
			rpcs = [{address: CANTO_RPC}, ...chain_rpc]
		} else {
			rpcs = chain_rpc
		}
		return rpcs
	}

	let query_client: IbcExtension;
	const get_query_client = async (chain_id: string): Promise<IbcExtension> => {		
		const chain = chains.find((chain) => chain.chain_id === chain_id);
		if (chain === undefined) {
			toast.error(`Chain ${chain_id} not found`, toast_style);
			throw new Error('Chain not found');
		}
		let chain_rpc = chain.apis?.rpc;
		if (chain_rpc === undefined) {
			throw new Error('Chain RPC not found');
		}		

		// hardcode non ass endpoints that actually work	
		chain_rpc = proper_rpcs(chain_id, chain_rpc)
		if (!chain_rpc) {
			throw new Error('Chain RPC not found');
		}		


		// try 10 different endpoints max
		for (let i = 0; i < 10; i++) {
			try {
				const tm_client = await Tendermint34Client.connect(chain_rpc[i].address);		
				let temp = QueryClient.withExtensions(tm_client);
				query_client = setupIbcExtension(temp);
				break;
			} catch (error) {
				// cors issues
				console.log(error);
			}
		}

		return query_client;
	}

	const get_wallet_for_chain = async (
		chain_id: string
	): Promise<OfflineAminoSigner | OfflineDirectSigner> => {
		if (chain_input === undefined) {
			toast.error(`From chain not selected`, toast_style);
			throw new Error('Chain not found');
		}

		// open keplr
		const keplr = window as KeplrWindow;
		if (keplr === undefined) {
			toast.error(`Keplr not found`, toast_style);
			throw new Error('Keplr not found');
		}

		let signer = keplr.getOfflineSignerAuto;
		if (signer === undefined) {
			throw new Error('Keplr not found');
		}

		return signer(chain_id);
	};

	const get_ibc_denom_human_readable = async (chain_id: string, ibc_trace: string): Promise<DenomTrace | undefined> => {		
		if (ibc_trace !== undefined && (!ibc_trace.startsWith('ibc/'))) {
			return undefined;
		}

		// redefine as it could be a new wallet / chain connection
		query_client = await get_query_client(chain_id);		
		
		// maybe get all denom traces in the future instead of a single one per, are they the same SHA hash (trace)?
		const data = await query_client.ibc.transfer.denomTrace(ibc_trace);
		console.log('data', data)

		return data?.denomTrace;
	}

	// async function connectToChain
	const connect_wallet_get_balances = async () => {		
		const chain = chains.find((chain) => chain.chain_id === chain_input);
		if (chain === undefined) {
			throw new Error('Chain not found');
		}

		let chain_rpc = chain.apis?.rpc;
		if (chain_rpc === undefined) {
			throw new Error('Chain RPC not found');
		}

		let wallet = await get_wallet_for_chain(chain.chain_id);
		wallet.getAccounts().then((accounts) => {
			console.log('accounts', accounts);
		});

		// hardcode non ass endpoints that actually work
		chain_rpc = proper_rpcs(chain.chain_id, chain_rpc)
		if (!chain_rpc) {
			throw new Error('Chain RPC not found');
		}	

		// try 10 different endpoints max
		for (let i = 0; i < 10; i++) {
			try {
				from_client = await SigningStargateClient.connectWithSigner(chain_rpc[i].address, wallet, {
					prefix: chain.bech32_prefix
				});
				await from_client.getAllBalances((await wallet.getAccounts())[0].address); // ensures it works correctly
				break;
			} catch (error) {
				// cors
				console.log(error);
			}
		}

		if (from_client === undefined) {
			throw new Error('RPC with CORS not found, Client can not be created');
		}

		// get the from balance of addr
		// assign read only from await client.getAllBalances(addr) to user_balancecs Coin[]
		const _bals = await from_client.getAllBalances((await wallet.getAccounts())[0].address);
		// console.log(balances)		
		
		// set the global users_balances to balances		
		balances = []
		for (const b of _bals) {
			// instead get all denoms from the chain in the future so it only requires 1 query
			if (b.denom.startsWith('ibc/')) {		
				// get the human readable name
				await get_ibc_denom_human_readable(chain_input, b.denom).then((denom_trace) => {
					if (denom_trace !== undefined) {

						let symbol = denom_trace.baseDenom;
						if(symbol.startsWith('u')) {
							symbol = symbol.substring(1).toUpperCase();
						}

						console.log('symbol', symbol)

						balances.push({
							denom: denom_trace.baseDenom,
							amount: b.amount,
							ibc_trace: b.denom, // so we know what we are actually sending
							channel: denom_trace.path,
							symbol: symbol,
						});
					}
				}).catch((error) => {
					// its possible you send a denom to another chain which does not have it
					// Ex: Osmosis DEX stars -> Cosmos Hub - breaks since CosmosHub is not relaying with stars
					// So push it as ibc_trace for the Denom name, oh well
				
					console.log(error);
					balances.push({
						denom: b.denom,
						amount: b.amount,
						symbol: b.denom, // standard ibc/ name if none is found			
					});
				})
			} else {
				let symbol = b.denom;
				if(symbol.startsWith('u')) {
					symbol = symbol.substring(1).toUpperCase();
				}

				balances.push({
					denom: b.denom,
					amount: b.amount,
					symbol: symbol, // standard ibc/ name if none is found
				});
			}
		}		
		// update it for Svelte
		balances = [...balances]
		console.log('balances', balances);
		// set the id of denoms_to_send to display show
		document.getElementById('denoms_to_send')!.style.display = 'block';
		toast.success(`Keplr Connected to ${chain.pretty_name}`, {
			position: 'top-right',
			duration: 6000,
			style: 'border-radius: 200px; background: #333; color: #fff; width: 12.5%;'
		});
	};

	interface Channel {
		name: string;
		channel_id: string;
		version: string; // ics20-1
		port_id: string; // transfer
	}

	const get_all_channel_pairs = (from_name: string): Channel[] => {
		const matches: Channel[] = [];

		for (const channel of ibc) {
			const c = channel.channels[0]; // why channel 0

			if (channel.chain_1.chain_name === from_name) {
				matches.push({
					name: channel.chain_2.chain_name,
					channel_id: c.chain_1.channel_id,
					port_id: c.chain_1.port_id,
					version: c.version
				});
			} else if (channel.chain_2.chain_name === from_name) {
				matches.push({
					name: channel.chain_1.chain_name,
					channel_id: c.chain_2.channel_id,
					port_id: c.chain_2.port_id,
					version: c.version
				});
			}
		}
		return matches;
	};

	// get_all_channel_pairs("cosmoshub")

	const get_channel = (from_name: string, to_name: string): string | undefined => {
		const pairs = get_all_channel_pairs(from_name);
		// todo; add version & port_id in the future
		for (const pair of pairs) {
			if (pair.name === to_name) {
				return pair.channel_id;
			}
		}

		return undefined;
	};

	const ibc_transfer = async () => {
		// use sendIbcTokens from stargate client
		const chain = chains.find((chain) => chain.chain_id === chain_input);
		if (chain === undefined) {
			toast.error(`From chain ${chain_input} not found`, toast_style);
			throw new Error('Chain not found');
		}

		const to_chain = chains.find((chain) => chain.chain_id === to_chain_input);
		if (to_chain === undefined) {
			toast.error(`To chain ${to_chain_input} not found`, toast_style);
			throw new Error('Chain not found');
		}

		let chain_rpc = chain.apis?.rpc;
		let to_chain_rpc = to_chain.apis?.rpc;
		if (chain_rpc === undefined || to_chain_rpc === undefined) {
			throw new Error('Chain RPC not found');
		}

		let wallet = await get_wallet_for_chain(chain.chain_id);
		const addr = (await wallet.getAccounts())[0].address;

		const to_wallet = await get_wallet_for_chain(to_chain.chain_id);
		const to_wallet_addr = (await to_wallet.getAccounts())[0].address;

		// get current time in seconds
		const current_time = Math.floor(Date.now() / 1000);
		const timeout_time = current_time + 300; // 5 minutes

		const channel_id = get_channel(chain.chain_name, to_chain.chain_name); // ex: channel-141
		if (channel_id === undefined || channel_id === '') {
			toast.error(
				`There is no IBC channel for ${chain.chain_name} -> ${to_chain.chain_name} with version ${channel_version} and port_id ${port_id}`,
				toast_style
			);
			throw new Error('Channel not found');
		}

		if (from_client === undefined) {
			throw new Error('from_client not found');
		}		

		toast('Waiting for Keplr to sign IBC transfer', { ...toast_style, icon: '⏳' });

		// TODO: What about LP positions?
		let actual_amount = ibc_amount;
		if (divisor == 10**6) {
			actual_amount = ibc_amount * 10**6;
		}

		if (ibc_denom.length == 0) {
			toast.error(`No denom selected`, toast_style);
			throw new Error('No denom selected');
		}

		from_client
			.sendIbcTokens(
				addr,
				to_wallet_addr,
				{ denom: ibc_denom, amount: actual_amount.toString() },
				port_id,
				channel_id,
				undefined,
				timeout_time,
				{ amount: [], gas: gas.toString() },
				`ibc.reece.sh | from ${chain.pretty_name} to ${to_chain.pretty_name}`
			)
			.then((tx) => {
				console.log(tx);
				if (tx.code == 0) {
					toast.success(
						`IBC transfer from ${chain.pretty_name} successful\n\nTxHash: ${tx.transactionHash}`,
						toast_style
					);
				}				
			})			
			.catch((err) => {
				toast.error(`${err}`, toast_style);
			});        
	};
</script>

<Toaster />

<!-- datalist of users_balances -->
<datalist id="denoms">
	{#each balances as balance}
		<option value={balance.denom}>{balance.denom}</option>
	{/each}
</datalist>

<!-- chain names & match with chain_id value -->
<datalist id="chain_names">
	{#each chains as chain}
		<option value={chain.chain_id}>{chain.pretty_name}</option>
	{/each}
</datalist>

<!-- datalist of denoms in humand reacable format -->
<datalist id="denoms_human_readable">
	{#each balances as denom}
		<option value={denom.denom}>{denom.denom}</option>
	{/each}
</datalist>

<!-- chain names & match with chain_id value -->
<datalist id="chain_names">
	{#each chains as chain}
		<option value={chain.chain_id}>{chain.pretty_name}</option>
	{/each}
</datalist>

<div class="page container">

	<h1>IBC Anywhere</h1>
	<p>Easily IBC token transfer from and to any chain in a few clicks (<a href="https://twitter.com/Reecepbcups_" target="noreferrer">Get Support</a>)</p>
	<p><a href="https://github.com/Reecepbcups/ibc-anywhere-webapp" target="noreferrer">Open Source</a></p>

	<hr>

<center>
	<div id="from_chain" class="div_center">
		<h3>From Chain</h3>
		<p>Type the chain you want and select in in the dropdown box</p>
		<input
			id="chain_input"
			type="text"
			placeholder="from chain-id"
			list="chain_names"
			bind:value={chain_input}
		/>

		<!-- Connects the wallet to the current chain, then we will show the user more information. -->
		<input type="submit" value="Connect Wallet" on:click={() => connect_wallet_get_balances()} />
	</div>

	<div id="denoms_to_send" style="display: none;" class="div_center">		
		<h3>Balances</h3>

		<ul>
			{#each balances as b}
				{#if b.channel === undefined}
					
					{#if divisor > 1}
						<li>{Number(b.amount)/divisor} {b.symbol}</li>
					{:else}					
						<li>{b.amount} {b.denom}</li>
					{/if}

				{:else}

					{#if divisor > 1}
						<li>{Number(b.amount)/divisor} {b.symbol} <i>({b.channel})</i></li>
					{:else}					
						<li>{b.amount} {b.denom}</li>
					{/if}

				{/if}
			{/each}
		</ul>
		
		<input type="number" placeholder="Amount" bind:value={ibc_amount} />				

		<!-- create a select input box of list denoms -->
		<select bind:value={ibc_denom}>
			<option value="" disabled selected>Select a Denom</option>

			{#each balances as balance, i}	
				{#if balance.channel === undefined}
					<option value={balance.denom}>{balance.symbol}</option>				
				{:else}
					<option value={balance.ibc_trace}>{balance.symbol} ({balance.channel})</option>
				{/if}
			{/each}

		</select>

		<!-- create a button which when clicked, toggles divisor -->
		<br>
		<input type="submit" value="(Advanced) Toggle Denom Format" on:click={() => toggle_divisor()} />

		<h4>To Chain</h4>
		<input type="text" placeholder="to chain-id" list="chain_names" bind:value={to_chain_input} />
		<input type="submit" on:click={() => ibc_transfer()} />
	</div>

	<div id="successful_txs" style="display: none;" class="div_center">
		<ul id="past_txs_ul" />
	</div>
</center>
</div>

<style>
	* {
		font-size: 1.0em;		
		color: #fff;
		font-family: 'Nunito Sans', sans-serif;
	}

	:global(body) {
		background-color: #1c1c1c;
	}

	.page {
		padding-top: 30px;
		width: 100%;
		margin: auto;
		display: grid;
		position: relative;
	}

	.container {
		background-color: #333;
		padding: 24px;
		margin-top: 1%;
		border-radius: 16px;
		width: 600px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		margin-left: auto;
		margin-right: auto;
		box-shadow: 15px 20px 30px #444444;
		border: 1px solid #000;
	}

	input[type="submit"] {
		margin: 16px;
		padding: 8px 16px;
		border: none;
		border-radius: 8px;
		background-color: #fff;
		color: #000;
		font-size: 16px;
		cursor: pointer;
	}

	input[type='text'],
	input[type='number'],
	select {
		width: 40%;
		padding: 12px 20px;
		margin: 8px 0;
		display: inline-block;
		border: 1px solid #ccc;
		border-radius: 4px;
		box-sizing: border-box;
		color: #fff;		
		background-color: #000;		
	} 

	h1 {
		font-size: 48px;
		margin-bottom: 10px;
		text-align: center;
	}

	ul {
		list-style: none;
	}

	li {
		margin: 10px;
	}
</style>
