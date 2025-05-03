import express from 'express'
import http from 'http'
import QRCode from 'qrcode'
import * as jsQR from 'jsqr'
import { createCanvas, loadImage } from 'canvas'
import open from 'open'
import { EventEmitter } from 'events'

// Define types for QR login functionality
interface QRLoginOptions {
  timeout?: number
  port?: number
}

class QRLoginManager extends EventEmitter {
  private server: http.Server | null = null
  private port: number
  private timeout: number
  private timer: NodeJS.Timeout | null = null
  private qrData: string | null = null
  private lineQRCodeUrl: string | null = null

  constructor(options: QRLoginOptions = {}) {
    super()
    this.port = options.port || 0 // 0 means the OS will assign an available port
    this.timeout = options.timeout || 300000 // 5 minutes default timeout
  }

  /**
   * Starts the QR login process
   * @returns A promise that resolves with the scanned QR data
   */
  public async startQRLogin(): Promise<string> {
    return new Promise((resolve, reject) => {
      const app = express()

      // Setup Express server
      app.use(express.json())
      app.use(express.urlencoded({ extended: true }))

      // Main page with QR code display and camera access for scanning
      app.get('/', (req, res) => {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>LINE QR Code Login</title>
            <style>
              body {
                font-family: 'Arial', sans-serif;
                text-align: center;
                margin: 0;
                padding: 20px;
                background-color: #f7f7f7;
                color: #333;
              }
              .container {
                max-width: 800px;
                margin: 0 auto;
                background-color: white;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
              }
              h1 {
                color: #06C755;
              }
              #qrcode {
                margin: 20px auto;
                padding: 10px;
                background: white;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
                display: inline-block;
              }
              #video-container {
                position: relative;
                width: 100%;
                max-width: 500px;
                margin: 0 auto;
                display: none;
              }
              #video {
                width: 100%;
                border-radius: 10px;
                border: 3px solid #ddd;
              }
              #scan-area {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 200px;
                height: 200px;
                border: 2px solid #06C755;
                border-radius: 10px;
                z-index: 1;
                pointer-events: none;
              }
              .scan-corners {
                position: absolute;
                width: 20px;
                height: 20px;
                border-color: #06C755;
                border-style: solid;
                border-width: 0;
              }
              #tl { top: 0; left: 0; border-top-width: 3px; border-left-width: 3px; border-top-left-radius: 5px; }
              #tr { top: 0; right: 0; border-top-width: 3px; border-right-width: 3px; border-top-right-radius: 5px; }
              #bl { bottom: 0; left: 0; border-bottom-width: 3px; border-left-width: 3px; border-bottom-left-radius: 5px; }
              #br { bottom: 0; right: 0; border-bottom-width: 3px; border-right-width: 3px; border-bottom-right-radius: 5px; }
              #status {
                margin-top: 20px;
                padding: 10px;
                font-weight: bold;
              }
              .instructions {
                background-color: #f9f9f9;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
                border-left: 3px solid #06C755;
                text-align: left;
              }
              button {
                background-color: #06C755;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
                margin: 10px 5px;
              }
              button:hover {
                background-color: #05a648;
              }
              .hide {
                display: none;
              }
              .tabs {
                display: flex;
                justify-content: center;
                margin-bottom: 20px;
              }
              .tab {
                background-color: #f0f0f0;
                border: none;
                padding: 10px 20px;
                border-radius: 5px 5px 0 0;
                cursor: pointer;
                margin: 0 5px;
              }
              .tab.active {
                background-color: #06C755;
                color: white;
              }
              .tab-content {
                display: none;
              }
              .tab-content.active {
                display: block;
              }
              #qr-container {
                margin: 20px auto;
                text-align: center;
              }
              #qr-code-display {
                margin: 0 auto;
                max-width: 250px;
              }
              .loading-spinner {
                border: 4px solid rgba(0, 0, 0, 0.1);
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border-left-color: #06C755;
                animation: spin 1s linear infinite;
                margin: 20px auto;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              footer {
                margin-top: 30px;
                color: #666;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>LINE QR Code Login</h1>

              <div class="tabs">
                <button class="tab active" id="qr-tab">Scan with Phone</button>
                <button class="tab" id="camera-tab">Scan with Camera</button>
              </div>

              <!-- QR Code Display Tab -->
              <div class="tab-content active" id="qr-content">
                <div class="instructions">
                  <p>1. Open LINE app on your smartphone</p>
                  <p>2. Scan the QR code below with your LINE app</p>
                  <p>3. Follow the instructions in your LINE app to complete login</p>
                </div>

                <div id="qr-container">
                  <div id="qr-loading" class="loading-spinner"></div>
                  <div id="qr-code-display" class="hide"></div>
                </div>

                <div id="qr-status">Waiting for QR code...</div>
              </div>

              <!-- Camera Scanning Tab -->
              <div class="tab-content" id="camera-content">
                <div class="instructions">
                  <p>1. Allow camera access when prompted</p>
                  <p>2. Open LINE on your phone and go to Settings > QR Code</p>
                  <p>3. Display your LINE QR code to the camera</p>
                  <p>4. Wait for successful scan and login confirmation</p>
                </div>

                <div id="video-container">
                  <video id="video" autoplay></video>
                  <div id="scan-area">
                    <div id="tl" class="scan-corners"></div>
                    <div id="tr" class="scan-corners"></div>
                    <div id="bl" class="scan-corners"></div>
                    <div id="br" class="scan-corners"></div>
                  </div>
                </div>

                <div id="camera-status">Ready to start camera</div>

                <button id="start-camera-button">Start Camera</button>
                <button id="cancel-button" class="hide">Cancel</button>
              </div>

              <footer>Vanilla LINE Bot QR Login</footer>
            </div>

            <script>
              // Tab switching functionality
              const qrTab = document.getElementById('qr-tab');
              const cameraTab = document.getElementById('camera-tab');
              const qrContent = document.getElementById('qr-content');
              const cameraContent = document.getElementById('camera-content');
              const videoContainer = document.getElementById('video-container');

              qrTab.addEventListener('click', () => {
                qrTab.classList.add('active');
                cameraTab.classList.remove('active');
                qrContent.classList.add('active');
                cameraContent.classList.remove('active');

                // Stop camera if it's running when switching tabs
                stopScanning();
              });

              cameraTab.addEventListener('click', () => {
                cameraTab.classList.add('active');
                qrTab.classList.remove('active');
                cameraContent.classList.add('active');
                qrContent.classList.remove('active');
                videoContainer.style.display = 'block';
              });

              // QR Code polling functionality
              let qrCodePolling;
              const qrLoading = document.getElementById('qr-loading');
              const qrCodeDisplay = document.getElementById('qr-code-display');
              const qrStatus = document.getElementById('qr-status');

              function startQRPolling() {
                // First check if we already have a QR code
                fetch('/qr-code')
                  .then(response => response.json())
                  .then(data => {
                    if (data.success && data.qrCode) {
                      displayQRCode(data.qrCode);
                    } else {
                      // Start polling for QR code
                      qrCodePolling = setInterval(() => {
                        fetch('/qr-code')
                          .then(response => response.json())
                          .then(data => {
                            if (data.success && data.qrCode) {
                              clearInterval(qrCodePolling);
                              displayQRCode(data.qrCode);
                            }
                          })
                          .catch(error => {
                            console.error('Error fetching QR code:', error);
                          });
                      }, 2000); // Poll every 2 seconds
                    }
                  });
              }

              function displayQRCode(qrCode) {
                qrLoading.classList.add('hide');
                qrCodeDisplay.classList.remove('hide');
                qrCodeDisplay.innerHTML = '<img src="' + qrCode + '" alt="LINE QR Code" style="width: 100%;">';
                qrStatus.textContent = 'Scan this QR code with your LINE app';
                qrStatus.style.color = '#06C755';

                // Start checking for login status
                startLoginStatusCheck();
              }

              function startLoginStatusCheck() {
                const loginStatusCheck = setInterval(() => {
                  fetch('/login-status')
                    .then(response => response.json())
                    .then(data => {
                      if (data.success && data.loggedIn) {
                        clearInterval(loginStatusCheck);
                        qrStatus.textContent = 'Login successful! Redirecting...';
                        qrStatus.style.color = 'green';
                      }
                    })
                    .catch(error => {
                      console.error('Error checking login status:', error);
                    });
                }, 2000); // Check every 2 seconds
              }

              // Start polling for QR code on page load
              startQRPolling();

              // Camera functionality for scanning
              let videoStream;
              const video = document.getElementById('video');
              const cameraStatus = document.getElementById('camera-status');
              const startCameraButton = document.getElementById('start-camera-button');
              const cancelButton = document.getElementById('cancel-button');

              startCameraButton.addEventListener('click', startCamera);
              cancelButton.addEventListener('click', stopScanning);

              function startCamera() {
                videoContainer.style.display = 'block';
                startCameraButton.classList.add('hide');
                cancelButton.classList.remove('hide');
                cameraStatus.textContent = 'Requesting camera access...';

                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                  .then(function(stream) {
                    videoStream = stream;
                    video.srcObject = stream;
                    cameraStatus.textContent = 'Camera active. Point to a LINE QR code.';
                    startScanning();
                  })
                  .catch(function(error) {
                    cameraStatus.textContent = 'Error accessing camera: ' + error.message;
                    cameraStatus.style.color = 'red';
                    startCameraButton.classList.remove('hide');
                    cancelButton.classList.add('hide');
                  });
              }

              function stopScanning() {
                if (videoStream) {
                  videoStream.getTracks().forEach(track => track.stop());
                  video.srcObject = null;
                }
                cancelButton.classList.add('hide');
                startCameraButton.classList.remove('hide');
                cameraStatus.textContent = 'Scanning canceled';
                videoContainer.style.display = 'none';
              }

              function startScanning() {
                // Create canvas for scanning frames
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');

                function scanQRCode() {
                  if (video.readyState === video.HAVE_ENOUGH_DATA) {
                    // Set canvas dimensions to video dimensions
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;

                    // Draw current video frame to canvas
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);

                    // Get image data for QR code scanning
                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

                    // Try to find QR code in image
                    try {
                      // Send the image data to the server for processing
                      fetch('/scan', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          imageData: canvas.toDataURL('image/jpeg', 0.7)
                        }),
                      })
                      .then(response => response.json())
                      .then(data => {
                        if (data.success && data.qrData) {
                          // QR code found
                          cameraStatus.textContent = 'QR Code detected! Logging in...';
                          cameraStatus.style.color = 'green';
                          stopScanning();
                          // Send success confirmation
                          fetch('/confirm-scan', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ qrData: data.qrData }),
                          });
                        }
                      })
                      .catch(error => {
                        console.error('Error scanning QR code:', error);
                      });
                    } catch (error) {
                      console.error('Error processing image:', error);
                    }
                  }

                  // Continue scanning if camera is still active
                  if (video.srcObject) {
                    requestAnimationFrame(scanQRCode);
                  }
                }

                requestAnimationFrame(scanQRCode);
              }
            </script>
          </body>
          </html>
        `)
      })

      // Endpoint to provide QR code for scanning
      app.get('/qr-code', async (req, res) => {
        try {
          // If LINE QR code is available, return it
          if (this.lineQRCodeUrl) {
            return res.json({ success: true, qrCode: this.lineQRCodeUrl })
          }

          // Generate a QR code if not available
          const qrCode = await this.generateQRCode()
          return res.json({ success: true, qrCode })
        } catch (error) {
          console.error('Error generating QR code:', error)
          return res.status(500).json({ success: false, error: 'Failed to generate QR code' })
        }
      })

      // Endpoint to check login status
      app.get('/login-status', (req, res) => {
        res.json({ success: true, loggedIn: this.qrData !== null })
      })

      // Endpoint to process scanned images from client
      app.post('/scan', async (req, res) => {
        try {
          if (!req.body.imageData) {
            return res.status(400).json({ success: false, error: 'No image data provided' })
          }

          // Extract image data from data URL
          const dataURL = req.body.imageData
          const base64Data = dataURL.replace(/^data:image\/jpeg;base64,/, '')
          const imageBuffer = Buffer.from(base64Data, 'base64')

          // Load image using canvas
          const image = await loadImage(imageBuffer)
          const canvas = createCanvas(image.width, image.height)
          const ctx = canvas.getContext('2d')
          ctx.drawImage(image, 0, 0)

          // Get image data for QR code detection
          const imageData = ctx.getImageData(0, 0, image.width, image.height)

          // Detect QR code
          const qrCode = jsQR(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
          )

          if (qrCode) {
            // QR code found, return data
            return res.json({ success: true, qrData: qrCode.data })
          }

          // No QR code found
          return res.json({ success: false })
        } catch (error) {
          console.error('Error processing image:', error)
          return res.status(500).json({ success: false, error: 'Error processing image' })
        }
      })

      // Endpoint to confirm successful scan
      app.post('/confirm-scan', (req, res) => {
        const { qrData } = req.body
        if (qrData) {
          this.qrData = qrData
          this.emit('qrScanned', qrData)
          res.json({ success: true })
        } else {
          res.status(400).json({ success: false, error: 'No QR data provided' })
        }
      })

      // Start HTTP server
      this.server = app.listen(this.port, () => {
        const address = this.server?.address() as { port: number }
        const serverUrl = `http://localhost:${address.port}`
        console.log(`🔒 LINE QR Login server running at: ${serverUrl}`)
        console.log('Please open the URL in your browser to log in.')

        // Automatically open the browser
        open(serverUrl).catch(() => {
          console.log('Could not open browser automatically. Please open the URL manually.')
        })

        // Set timeout
        this.timer = setTimeout(() => {
          this.closeServer()
          reject(new Error('QR login timed out after ' + (this.timeout / 1000) + ' seconds'))
        }, this.timeout)
      })

      // Listen for successful QR scan
      this.once('qrScanned', (qrData: string) => {
        this.closeServer()
        resolve(qrData)
      })
    })
  }

  /**
   * Generate a QR code data URL
   * @returns Promise resolving to QR code data URL
   */
  private async generateQRCode(): Promise<string> {
    try {
      // This will be replaced with the actual LINE QR code when available
      return await QRCode.toDataURL('Waiting for LINE QR code...', {
        color: {
          dark: '#06C755',
          light: '#FFF'
        },
        width: 250,
        margin: 1
      })
    } catch (error) {
      console.error('Error generating QR code:', error)
      throw error
    }
  }

  /**
   * Set the LINE QR code URL for display
   * @param url The URL of the QR code image to display
   */
  public setQRCodeUrl(url: string): void {
    this.lineQRCodeUrl = url
  }

  private closeServer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.server) {
      this.server.close(() => {
        console.log('QR login server closed')
      })
      this.server = null
    }
  }
}

export default QRLoginManager