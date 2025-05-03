import { Client } from '@evex/linejs'
import { HumanMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import Queue from 'p-queue'

import { createThread } from './ai'
import { chatGraph } from './chatGraph'
import { getThread, setThread, storeMessage } from './dynamoDB'
import { getParameter, setParameter } from './ssm'
import QRLoginManager from './qrLogin'

export class Vanilla {
  client: Client
  graph: ReturnType<typeof chatGraph>
  name: string
  queue: Queue

  constructor(name = '香草') {
    this.client = new Client()
    this.graph = chatGraph(new MemorySaver())
    this.name = name
    this.queue = new Queue({ concurrency: 1 })

    this.client.on('update:authtoken', async (authToken) => await setParameter('/vanilla/line/authToken', authToken))
    this.client.on('square:message', async (event) => this.queue.add(async () => await this.respond(event)))
    this.client.on('ready', async () => {
      process.env.DEEPSEEK_API_KEY = await getParameter('/vanilla/openai/apiKey')
      process.env.TAVILY_API_KEY = await getParameter('/vanilla/tavily/apiKey')
    })
  }

  private async respond({ author, content, contentMetadata, contentType, squareChatMid, reply }) {
    try {
      if (contentType === 'NONE' && content) {
        const user = await author.displayName
        const question = content.replaceAll('@' + this.name, '').trim()
        await storeMessage({ thread_id: squareChatMid, content: user + '：' + question })

        if (contentMetadata?.MENTION && content.includes('@' + this.name)) {
          const response = await this.chat(squareChatMid, user + '：' + question)
          await reply(response)
        }
      }
    } catch (err) {
      console.log(err)
    }
  }

  private async chat(id: string, question: string) {
    let thread = await getThread(id)
    if (!thread) {
      thread = { id, conversation_id: (await createThread()).id }
      await setThread(thread)
    }

    const { response, reference } = await this.graph.invoke(
      {
        messages: [new HumanMessage(question)]
      },
      {
        configurable: { conversation_id: thread.conversation_id, thread_id: thread.id }
      }
  )

    return (response + (reference ? '\n\n參考來源：' + reference : '')).replace(this.name + '：', '')
  }

  public async login() {
    try {
      // First try auth token if available
      const authToken = await getParameter('/vanilla/line/authToken')
      if (authToken) {
        try {
          console.log('Attempting to login with auth token...')
          return await this.client.login({ authToken, device: 'DESKTOPMAC', v3: true })
        } catch (error) {
          console.log('Auth token login failed, trying email/password...')
          // Token might be expired, continue to next method
        }
      }

      // Try email/password login
      const email = await getParameter('/vanilla/line/email')
      const password = await getParameter('/vanilla/line/password')

      if (email && password) {
        try {
          console.log('Attempting to login with email and password...')
          return await this.client.login({
            email,
            password,
            device: 'ANDROIDLITE', // Try a different device type
            v3: true
          })
        } catch (error) {
          console.log('Email/password login failed:', error.message)
          // Continue to next method
        }
      }

      // Use our custom QR code login implementation
      console.log('Attempting QR code login with web interface...')
      try {
        // Create QR code login manager
        const qrLoginManager = new QRLoginManager({ timeout: 180000 }) // 3 minutes timeout

        // Start QR login server
        const qrLoginPromise = qrLoginManager.startQRLogin()

        // Get QR code URL from LINE client
        const qrCodeResult = await this.client.getQrCode()

        // Set QR code URL in the login manager
        if (qrCodeResult && qrCodeResult.url) {
          console.log('Received LINE QR code URL, updating web interface')
          qrLoginManager.setQRCodeUrl(qrCodeResult.url)
        }

        // Wait for QR code to be scanned or for PIN verification
        if (qrCodeResult && qrCodeResult.pinCode) {
          console.log(`LINE login PIN code: ${qrCodeResult.pinCode}`)
          console.log('Please enter this PIN code in your LINE app when prompted')
        }

        // Wait for the QR login process to complete (either by QR scan or PIN verification)
        const certificate = await qrLoginPromise
        console.log('QR code login successful')

        // Complete the login process
        return await this.client.login({
          certificate,
          device: 'ANDROIDLITE',
          v3: true
        })
      } catch (error) {
        console.error('QR login failed:', error.message)

        // If our custom QR login fails, fallback to built-in QR login
        console.log('Falling back to built-in QR login...')
        return await this.client.login({ type: 'qr' })
      }
    } catch (error) {
      console.error('All login methods failed:', error)
      throw error
    }
  }
}
