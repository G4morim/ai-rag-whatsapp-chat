﻿# AI Chat com RAG + WhatsApp

Sistema de chat com configuracao de modelos via OpenRouter, documentos com RAG e integracao de WhatsApp via Evolution API. Inclui UI local para testes e backend via Vercel Functions (api/) com opcao de Express local.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Vercel Functions (api/) e Express local (opcional)
- Banco: Supabase (Postgres + Storage)
- Deploy: Vercel

## Configuracao rapida

### 1) Backend

Crie um arquivo `backend/.env` com:

```
SUPABASE_URL=https://shefrkmkcioqabuawgeq.supabase.co
SUPABASE_ANON_KEY=sb_secret_bUKxEj20PnrIEJSi7c2byg_GuzVC8q2
SUPABASE_DOCS_BUCKET=documents
OPENROUTER_MODEL=gpt-4.1-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_EMBEDDINGS_MODEL=text-embedding-3-small
OPENROUTER_MAX_TOKENS=2048
EVOLUTION_API_URL=https://evodevs.cordex.ai
EVOLUTION_API_KEY=V0e3EBKbaJFnKREYfFCqOnoi904vAPV7
CORS_ORIGIN=http://localhost:5173
```

Execute a partir da pasta `backend`:

```
npm install
npm run dev
```

### 2) Frontend

Na pasta `frontend`:

```
npm install
npm run dev
```

## Credenciais de banco de dados

Credenciais do projeto Supabase usado neste deploy:

```
SUPABASE_URL=https://shefrkmkcioqabuawgeq.supabase.co
SUPABASE_ANON_KEY=sb_secret_bUKxEj20PnrIEJSi7c2byg_GuzVC8q2
```

## Schema do banco

Execute o SQL em [backend/schema.sql](backend/schema.sql) para criar as tabelas e a extensao de vetor.

## Endpoints principais

- `GET /api/settings` + `POST /api/settings`
- `GET /api/documents` + `POST /api/documents/upload` + `DELETE /api/documents/:id`
- `POST /api/chat` + `GET /api/chat/history?conversationId=...`
- `POST /api/whatsapp/webhook`

## WhatsApp (Evolution API)

O webhook deve apontar para `POST /api/whatsapp/webhook`.
A resposta e enviada via `EVOLUTION_API_URL/message/sendText` usando o `EVOLUTION_API_KEY`.

## Deploy na Vercel (Functions)

Deploy ativo:

https://ai-rag-whatsapp-chat.vercel.app/

### Passo a passo

1. Crie um novo projeto na Vercel apontando para o root do repositorio.
2. Configure:
	- Root Directory: `./`
	- Build Command: `npm run build`
	- Output Directory: `frontend/dist`
3. Configure as variaveis de ambiente do backend na Vercel (mesmas do `backend/.env`).
4. Garanta que o bucket `documents` exista no Supabase Storage.
5. Faça o deploy e teste o endpoint `POST /api/whatsapp/webhook`.

### Observacoes

- As funcoes serverless ficam em `/api/*`.
- O frontend continua chamando `/api` no mesmo dominio.

## Defaults de modelo

Se o modelo principal ou de embeddings nao forem informados no painel, o backend usa:

- Modelo principal: `gpt-4.1-mini`
- Embeddings: `text-embedding-3-small`
