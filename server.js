import express from 'express'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || 3001)

app.use(express.json({ limit: '1mb' }))

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'mercadopago-webhook' })
})

app.post('/webhook/mercadopago', async (request, response) => {
  const payload = request.body || {}
  const topic = request.query.topic || payload.type || payload.action || 'payment'
  const paymentId = request.query.id || request.query['data.id'] || payload?.data?.id || payload?.id || null

  let paymentDetails = null
  let lookupError = null

  if (process.env.MP_ACCESS_TOKEN && paymentId && String(topic).includes('payment')) {
    try {
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
      })

      if (mpResponse.ok) {
        paymentDetails = await mpResponse.json()
      } else {
        lookupError = `Mercado Pago retornou HTTP ${mpResponse.status}`
      }
    } catch (error) {
      lookupError = error instanceof Error ? error.message : 'Erro desconhecido ao consultar pagamento'
    }
  }

  console.log('Mercado Pago webhook recebido', {
    topic,
    paymentId,
    payload,
    paymentDetails,
    lookupError,
  })

  response.status(200).json({
    received: true,
    topic,
    paymentId,
    paymentFound: Boolean(paymentDetails),
    paymentStatus: paymentDetails?.status || null,
    lookupError,
  })
})

app.listen(port, () => {
  console.log(`Webhook do Mercado Pago rodando em http://localhost:${port}`)
})
