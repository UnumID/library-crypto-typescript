import { privateDecrypt, createDecipheriv, constants } from 'crypto';
import bs58 from 'bs58';

import { EncryptedData } from './types';
import { decodeKey, derToPem } from './helpers';
import { CryptoError } from './types/CryptoError';

/**
 * @param {string} privateKey RSA private key (pem or base58) corresponding to the public key used for encryption
 * @param {EncryptedData} encryptedData EncryptedData object, like one returned from encrypt()
 *                                      contains the encrypted data as a base58 string plus RSA-encrypted/base58-encoded
 *                                      key, iv, and algorithm information needed to recreate the AES key actually used for encryption
 * @param {string} encoding the encoding used for the publicKey ('base58' or 'pem', default 'pem')
 * @returns {object} the decrypted object
 */
export function decrypt (privateKey: string, encryptedData: EncryptedData, encoding: 'base58' | 'pem' = 'pem'): unknown {
  try {
    const { data } = encryptedData;
    const { iv, key, algorithm } = encryptedData.key;

    // decode the private key, if necessary
    const decodedPrivateKey = decodeKey(privateKey, encoding);

    // node can only decrypt with pem-encoded keys
    const privateKeyPem = derToPem(decodedPrivateKey, 'private');

    // decode aes key info and encrypted data from base58 to Buffers
    const decodedEncryptedIv = bs58.decode(iv);
    const decodedEncryptedKey = bs58.decode(key);
    const decodedEncryptedAlgorithm = bs58.decode(algorithm);
    const decodedEncryptedData = bs58.decode(data);

    // we need to use a key object to set non-default padding
    // for interoperability with android/ios cryptography implementations
    const privateKeyObj = {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_PADDING
    };

    // decrypt aes key info with private key
    const decryptedIv = privateDecrypt(privateKeyObj, decodedEncryptedIv);
    const decryptedKey = privateDecrypt(privateKeyObj, decodedEncryptedKey);
    const decryptedAlgorithm = privateDecrypt(privateKeyObj, decodedEncryptedAlgorithm);

    // create aes key
    const decipher = createDecipheriv(decryptedAlgorithm.toString(), decryptedKey, decryptedIv);

    // decrypt data with aes key
    const decrypted1 = decipher.update(decodedEncryptedData);
    const decrypted2 = decipher.final();
    const decrypted = Buffer.concat([decrypted1, decrypted2]);

    // re-encode decrypted data as a regular utf-8 string
    const decryptedStr = decrypted.toString('utf-8');

    // parse original encoded object from decrypted json string
    return JSON.parse(decryptedStr);
  } catch (e) {
    throw new CryptoError(e.message, e.code);
  }
}
