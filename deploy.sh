#!/bin/bash

# Script para atualizar o projeto automaticamente
# Uso: ./deploy.sh "mensagem do commit"

# Adiciona todas as mudanças
git add .

# Faz commit com a mensagem fornecida (ou mensagem padrão)
if [ -z "$1" ]; then
  git commit -m "Update: $(date '+%Y-%m-%d %H:%M')"
else
  git commit -m "$1"
fi

# Envia para o GitHub
git push

echo "✅ Código enviado para o GitHub!"
echo "🚀 Vercel vai fazer deploy automático em ~1 minuto"
