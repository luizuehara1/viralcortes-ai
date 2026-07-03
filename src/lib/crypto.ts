import crypto from 'crypto'

// AES-256-GCM para cifrar segredos em repouso (tokens OAuth). A chave vem de
// ENCRYPTION_KEY (hex de 32 bytes) — nunca logar texto plano nem a chave.
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) {
    throw new Error(
      'ENCRYPTION_KEY não configurada no .env. Gere uma com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY inválida: precisa ser um hex de 32 bytes (64 caracteres).')
  }
  return key
}

export function encrypt(plainText: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(payload: string): string {
  const key = getKey()
  const [ivHex, authTagHex, dataHex] = payload.split(':')
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error('Payload cifrado em formato inválido.')
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
  return decrypted.toString('utf8')
}
