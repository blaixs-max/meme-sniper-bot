import { ethers, Wallet as EthersWallet, Contract } from 'ethers';
import { blockchain } from './blockchain.js';
import { walletConfig } from '../config/settings.js';
import { TOKENS } from '../config/constants.js';
import { encrypt, decrypt, maskPrivateKey } from '../utils/encryption.js';
import { createLogger } from '../utils/logger.js';
import { formatBNB, retry } from '../utils/helpers.js';
import { WalletInfo } from '../types/index.js';
import fourMemeAbi from '../../abis/four-meme.json';

const logger = createLogger('WALLET');

const ERC20_ABI = fourMemeAbi.ERC20;

export class WalletManager {
  private wallet: EthersWallet | null = null;
  private nonce: number = 0;

  /**
   * Initialize wallet from encrypted or plain private key
   */
  async initialize(): Promise<void> {
    let privateKey: string;

    if (walletConfig.hasEncryptedKey()) {
      try {
        privateKey = decrypt(walletConfig.encryptedPrivateKey, walletConfig.encryptionKey);
        logger.info('Wallet initialized from encrypted key');
      } catch (error) {
        throw new Error('Failed to decrypt private key. Check your encryption key.');
      }
    } else if (walletConfig.hasPlainKey()) {
      privateKey = walletConfig.privateKey;
      logger.warn('Using plain private key - consider encrypting for production');
    } else {
      throw new Error('No wallet configured. Set PRIVATE_KEY or PRIVATE_KEY_ENCRYPTED in .env');
    }

    this.wallet = new EthersWallet(privateKey, blockchain.getHttpProvider());
    this.nonce = await this.wallet.getNonce();

    logger.info(`Wallet loaded: ${this.getAddress()}`);
  }

  /**
   * Initialize wallet from a provided private key (for testing/setup)
   */
  async initializeFromKey(privateKey: string): Promise<void> {
    this.wallet = new EthersWallet(privateKey, blockchain.getHttpProvider());
    this.nonce = await this.wallet.getNonce();
    logger.info(`Wallet initialized: ${this.getAddress()}`);
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    if (!this.wallet) throw new Error('Wallet not initialized');
    return this.wallet.address;
  }

  /**
   * Get wallet instance for signing
   */
  getWallet(): EthersWallet {
    if (!this.wallet) throw new Error('Wallet not initialized');
    return this.wallet;
  }

  /**
   * Get and increment nonce for transactions
   */
  async getNextNonce(): Promise<number> {
    // Refresh nonce from chain periodically
    const chainNonce = await this.wallet!.getNonce();
    this.nonce = Math.max(this.nonce, chainNonce);
    return this.nonce++;
  }

  /**
   * Reset nonce from chain (after failed transaction)
   */
  async resetNonce(): Promise<void> {
    this.nonce = await this.wallet!.getNonce();
  }

  /**
   * Get BNB balance
   */
  async getBnbBalance(): Promise<bigint> {
    return retry(async () => {
      return await blockchain.getBalance(this.getAddress());
    });
  }

  /**
   * Get token balance
   */
  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    return retry(async () => {
      const contract = new Contract(tokenAddress, ERC20_ABI, blockchain.getHttpProvider());
      return await contract.balanceOf(this.getAddress());
    });
  }

  /**
   * Get wallet info with balances
   */
  async getWalletInfo(): Promise<WalletInfo> {
    const balanceBNB = await this.getBnbBalance();
    const balances = new Map<string, bigint>();

    // Get common token balances
    for (const [symbol, address] of Object.entries(TOKENS)) {
      try {
        const balance = await this.getTokenBalance(address);
        if (balance > 0n) {
          balances.set(symbol, balance);
        }
      } catch {
        // Ignore errors for token balances
      }
    }

    return {
      address: this.getAddress(),
      balanceBNB,
      balances,
    };
  }

  /**
   * Approve token spending
   */
  async approveToken(
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint = ethers.MaxUint256
  ): Promise<string> {
    const contract = new Contract(tokenAddress, ERC20_ABI, this.wallet!);

    // Check current allowance
    const currentAllowance = await contract.allowance(this.getAddress(), spenderAddress);
    if (currentAllowance >= amount) {
      logger.debug('Token already approved', { tokenAddress, spenderAddress });
      return '';
    }

    logger.info('Approving token spending', {
      token: tokenAddress,
      spender: spenderAddress,
    });

    const tx = await contract.approve(spenderAddress, amount, {
      nonce: await this.getNextNonce(),
    });

    const receipt = await tx.wait();
    logger.info('Token approved', { txHash: receipt.hash });

    return receipt.hash;
  }

  /**
   * Check token allowance
   */
  async getAllowance(tokenAddress: string, spenderAddress: string): Promise<bigint> {
    const contract = new Contract(tokenAddress, ERC20_ABI, blockchain.getHttpProvider());
    return await contract.allowance(this.getAddress(), spenderAddress);
  }

  /**
   * Display wallet summary
   */
  async displaySummary(): Promise<void> {
    const info = await this.getWalletInfo();
    console.log('\n=== Wallet Summary ===');
    console.log(`Address: ${info.address}`);
    console.log(`BNB Balance: ${formatBNB(info.balanceBNB)}`);

    if (info.balances.size > 0) {
      console.log('\nToken Balances:');
      for (const [symbol, balance] of info.balances) {
        console.log(`  ${symbol}: ${ethers.formatUnits(balance, 18)}`);
      }
    }
    console.log('=====================\n');
  }

  /**
   * Encrypt a private key for safe storage
   */
  static encryptPrivateKey(privateKey: string, password: string): string {
    return encrypt(privateKey, password);
  }

  /**
   * Decrypt a private key
   */
  static decryptPrivateKey(encryptedKey: string, password: string): string {
    return decrypt(encryptedKey, password);
  }

  /**
   * Generate a new wallet
   */
  static generateNewWallet(): { address: string; privateKey: string; mnemonic: string } {
    const wallet = EthersWallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase || '',
    };
  }

  /**
   * Mask private key for safe display
   */
  static maskKey(key: string): string {
    return maskPrivateKey(key);
  }
}

// Export singleton instance
export const walletManager = new WalletManager();
