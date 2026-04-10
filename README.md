# Facilitador de Evolução de Enfermagem

Aplicação web para preencher automaticamente um modelo padrão de evolução de enfermagem a partir de texto livre.

## Como usar

1. Em **Padrão de Evolução**, escreva seu modelo usando campos no formato `{{campo}}`.
2. Em **Evolução**, cole a evolução bruta.
3. (Opcional) Em **Ajustes Manuais**, use `campo: valor` para sobrescrever dados.
4. Copie o texto final em **Resultado Final**.

## Campos padrão reconhecidos

- `{{data}}`
- `{{paciente}}`
- `{{idade}}`
- `{{leito}}`
- `{{diagnostico}}`
- `{{subjetivo}}`
- `{{estado_geral}}`
- `{{sinais_vitais}}`
- `{{pulmoes}}`
- `{{cardiovascular}}`
- `{{abdome}}`
- `{{extremidades}}`
- `{{conduta}}`

## Scripts

- `npm run dev`: inicia ambiente de desenvolvimento
- `npm run build`: gera build de produção
- `npm run preview`: visualiza build local

## Publicar no GitHub Pages

1. Suba o projeto para um repositório no GitHub (branch `main`).
2. No GitHub, abra **Settings > Pages**.
3. Em **Build and deployment**, selecione **GitHub Actions** como source.
4. Faça um push para `main`.
5. O workflow `Deploy to GitHub Pages` vai gerar e publicar o conteúdo de `dist/` automaticamente.

Observações:

- O `base` do Vite é ajustado automaticamente no CI para `/<nome-do-repo>/`.
- Localmente, o app continua usando `http://localhost:5173/evolucao/`.

## Webhook de doação

1. Copie `.env.example` para `.env` e informe `MP_ACCESS_TOKEN`.
2. Execute `npm run webhook` para subir o endpoint local em `http://localhost:3001/webhook/mercadopago`.
3. Cadastre essa URL no painel do Mercado Pago em Webhooks/Notificações.
4. Para testar localmente, exponha a porta com `ngrok` ou outro túnel HTTPS.
