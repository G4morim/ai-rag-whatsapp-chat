# Processo

## Objetivo

Entregar um sistema de chat com RAG e integracao WhatsApp, incluindo UI de teste local, backend Express, persistencia no Supabase e deploy na Vercel.

## Etapas realizadas

1. Definicao de requisitos e artefatos de especificacao (proposal, design, specs, tasks).
2. Implementacao do backend: settings, documentos, RAG, chat e webhook WhatsApp.
3. Implementacao do frontend: painel de configuracoes, documentos e chat local.
4. Documentacao de ambiente, schema SQL e endpoints.

## Decisoes principais

- Backend em Express para acelerar o MVP.
- Supabase como banco + storage para documentos.
- RAG com chunking simples e top-k por similaridade.
- Evolution API para envio de mensagens no WhatsApp.

## Como testar

1. Configure `backend/.env` conforme o README.
2. Execute o SQL em [backend/schema.sql](backend/schema.sql).
3. Rode `npm run dev` no backend e no frontend.
4. Envie mensagens no chat local e valide as respostas.
