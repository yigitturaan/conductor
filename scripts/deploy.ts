import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as solc from "solc";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
});

async function deploy() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.log("DEPLOYER_PRIVATE_KEY .env'de bulunamadı.");
    console.log("");
    console.log("Deploy etmek için:");
    console.log("1. Monad testnet'te MON olan bir cüzdan private key'ini al");
    console.log("2. .env dosyasına ekle: DEPLOYER_PRIVATE_KEY=0x...");
    console.log("3. Bu scripti tekrar çalıştır: npx ts-node scripts/deploy.ts");
    console.log("");
    console.log("Testnet MON almak için: https://faucet.monad.xyz");
    process.exit(1);
  }

  console.log("ConductorVault deploy ediliyor...\n");

  // 1. Kontratı derle
  const contractPath = path.join(__dirname, "..", "contracts", "ConductorVault.sol");
  const source = fs.readFileSync(contractPath, "utf-8");

  const input = {
    language: "Solidity",
    sources: { "ConductorVault.sol": { content: source } },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors?.some((e: any) => e.severity === "error")) {
    console.error("Derleme hatası:");
    output.errors.forEach((e: any) => console.error(e.formattedMessage));
    process.exit(1);
  }

  const contract = output.contracts["ConductorVault.sol"]["ConductorVault"];
  const abi = contract.abi;
  const bytecode = `0x${contract.evm.bytecode.object}`;

  console.log("Kontrat derlendi ✅");

  // 2. Wallet oluştur
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Deployer: ${account.address}`);

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http("https://testnet-rpc.monad.xyz"),
  });

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http("https://testnet-rpc.monad.xyz"),
  });

  // 3. Bakiye kontrol
  const balance = await publicClient.getBalance({ address: account.address });
  const balanceMon = Number(balance) / 1e18;
  console.log(`Bakiye: ${balanceMon.toFixed(4)} MON`);

  if (balanceMon < 0.01) {
    console.log("Yetersiz bakiye! Faucet'ten MON al: https://faucet.monad.xyz");
    process.exit(1);
  }

  // 4. Deploy
  console.log("Deploy tx gönderiliyor...");
  const hash = await walletClient.deployContract({
    abi,
    bytecode: bytecode as `0x${string}`,
    chain: monadTestnet,
    account,
  } as any);

  console.log(`TX Hash: ${hash}`);
  console.log("Onay bekleniyor...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const contractAddress = receipt.contractAddress;

  console.log(`\n✅ ConductorVault deployed!`);
  console.log(`Address: ${contractAddress}`);
  console.log(`Block: ${receipt.blockNumber}`);
  console.log(`TX: ${hash}`);

  // 5. Adresi .env'ye kaydet
  const envPath = path.join(__dirname, "..", ".env");
  let envContent = fs.readFileSync(envPath, "utf-8");
  if (envContent.includes("VAULT_ADDRESS")) {
    envContent = envContent.replace(/VAULT_ADDRESS=.*/, `VAULT_ADDRESS=${contractAddress}`);
  } else {
    envContent += `\nVAULT_ADDRESS=${contractAddress}\n`;
  }
  fs.writeFileSync(envPath, envContent);

  console.log(`\nAdres .env'ye kaydedildi: VAULT_ADDRESS=${contractAddress}`);

  // 6. ABI'yi kaydet
  const abiPath = path.join(__dirname, "..", "contracts", "ConductorVault.json");
  fs.writeFileSync(abiPath, JSON.stringify({ abi, address: contractAddress }, null, 2));
  console.log(`ABI kaydedildi: contracts/ConductorVault.json`);
}

deploy().catch(console.error);
