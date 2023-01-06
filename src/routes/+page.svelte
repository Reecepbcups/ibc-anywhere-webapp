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
	// import type { IBCInfo } from '@chain-registry/types';
	import { assets, chains, ibc } from 'chain-registry';

	// Since RPCs are Ass, force use mine which ACTUALLY HAS CORS ENABLED AND LETS ME DEVELOP
	const JUNO_RPC = "https://juno-rpc.reece.sh"

	const toast_style: ToastOptions = {
		position: 'top-right',
		duration: 6000,
		style: 'background: #333; color: #fff; width: 15%; font-size: 1.1rem;'
	};    

	interface Balance {
		denom: string; // human readable (ex: uosmo)
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

	let query_client: IbcExtension;
	const get_query_client = async (chain_id: string): Promise<IbcExtension> => {
		// TODO: iterate through multiple until we get one with CORS

		// TODO: save this client in an object and/or iterate over failed client created in the chain_rpc array
		// create a stargate query client, query the ibc-transfer denom-trace, and return the human readable name
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
		if(chain_id === "juno-1") {
			chain_rpc = [{address: JUNO_RPC}, {address: "https://rpc.juno.strange.love/"}, ...chain_rpc]
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

	const get_connection_hops = async (from_chain: string, transferChannel: string): Promise<string[] | undefined> => {
		if (transferChannel === undefined) {
			return undefined;
		}

		if (!transferChannel.startsWith('transfer/')) {
			return undefined;
		}

		// use query_client
		const data = await query_client.ibc.verified.channel.channel(port_id, transferChannel);
		console.log('data', data);

		return data?.connectionHops
	}

	const get_ibc_denom_human_readable = async (chain_id: string, ibc_trace: string): Promise<DenomTrace | undefined> => {		
		if (ibc_trace !== undefined && (!ibc_trace.startsWith('ibc/'))) {
			return undefined;
		}

		// redefine as it could be a new wallet / chain connection
		query_client = await get_query_client(chain_id);		
		
		// maybe get all denom traces in the future instead of a single one per, are they the same SHA hash (trace)?
		const data = await query_client.ibc.transfer.denomTrace(ibc_trace);

		console.log('data', data)

		// doesn't return
		// const data = await query_client.ibc.transfer.allDenomTraces();
		// for(const trace of data.denomTraces) {			
		// 	// console.log(trace); // {path: 'transfer/channel-132', baseDenom: 'ugraviton'}
		// 	if (trace.path === ibc_trace) {
		// 		return trace;
		// 	}
		// }		

		// console.log(data);
		return data?.denomTrace;
		// return undefined;
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
		if(chain.chain_id === "juno-1") {
			chain_rpc = [{address: JUNO_RPC}, {address: "https://rpc.juno.strange.love/"}, ...chain_rpc]
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
						balances.push({
							denom: denom_trace.baseDenom,
							amount: b.amount,
							ibc_trace: b.denom, // so we know what we are actually sending
							channel: denom_trace.path,
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
					});
				})
			} else {
				balances.push({
					denom: b.denom,
					amount: b.amount,
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
		// const chain_id = "cosmoshub-4"
		const chain = chains.find((chain) => chain.chain_id === chain_input);
		if (chain === undefined) {
			toast.error(`From chain ${chain_input} not found`, toast_style);
			throw new Error('Chain not found');
		}

		// const to_chain_id = "osmosis-1"
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

		from_client
			.sendIbcTokens(
				addr,
				to_wallet_addr,
				{ denom: ibc_denom, amount: ibc_amount.toString() },
				port_id,
				channel_id,
				undefined,
				timeout_time,
				{ amount: [], gas: gas.toString() },
				`IBC-Anywhere by Reece | from ${chain.pretty_name} to ${to_chain.pretty_name}`
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

<!-- main website code -->
<h1>IBC Aggregator</h1>
<p>Easily IBC token transfer from and to any chain in 5 clicks (Desktop only right now) (<a href="https://twitter.com/Reecepbcups_" target="noreferrer">Get Support</a>)</p>
<p><i>WIP: channel proxy passthrough & ETH bridge support</i></p>
<p><a href="https://github.com/Reecepbcups/ibc-anywhere-webapp" target="noreferrer">Open Source</a></p>

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
		<br />
		<br />

		<!-- Connects the wallet to the current chain, then we will show the user more information. -->
		<input type="submit" value="Connect Wallet" on:click={() => connect_wallet_get_balances()} />
	</div>

	<div id="denoms_to_send" style="display: none;" class="div_center">		
		<h3>balances</h3>

		<ul>
			{#each balances as b}
				{#if b.channel === undefined}
					<li>{b.amount} {b.denom}</li>
				{:else}
					<li>{b.amount} {b.denom} <i>({b.channel})</i></li>
				{/if}
			{/each}
		</ul>

		<input type="number" placeholder="Amount" bind:value={ibc_amount} />

		<!-- create a select input box of list denoms -->
		<select bind:value={ibc_denom}>
			<option value="" disabled selected>Select a Denom</option>

			{#each balances as balance, i}	
				{#if balance.channel === undefined}
					<option value={balance.denom}>{balance.denom}</option>				
				{:else}
					<option value={balance.ibc_trace}>{balance.denom} ({balance.channel})</option>
				{/if}
			{/each}

		</select>

		<h4>To Chain</h4>
		<input type="text" placeholder="to chain-id" list="chain_names" bind:value={to_chain_input} />
		<input type="submit" on:click={() => ibc_transfer()} />
	</div>

	<div id="successful_txs" style="display: none;" class="div_center">
		<ul id="past_txs_ul" />
	</div>
</center>

<style>

	* {
		font-family: 'Nunito Sans', sans-serif;
	}

	:global(body) {
		background-color: #ffffff;
	}

	h1,
	h3,
	p {
		text-align: center;
		color: black;
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

	input[type='submit'] {
		background-color: #5e72e4;
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

	input[type='text'],
	input[type='number'],
	select {
		width: 25%;
		padding: 12px 20px;
		margin: 8px 0;
		display: inline-block;
		border: 1px solid #ccc;
		border-radius: 4px;
		box-sizing: border-box;
	}
</style>
