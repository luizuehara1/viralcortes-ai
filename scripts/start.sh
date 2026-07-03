#!/bin/bash
# Sobe o painel Next.js e o worker do BullMQ no mesmo container/serviço do
# Railway — assim os dois enxergam o mesmo disco (uploads/ e clips/), sem
# depender de Volume compartilhado entre serviços separados.
set -m

npm run worker &
npm run start &

# Se qualquer um dos dois cair, derruba o container inteiro — o Railway
# reinicia o serviço (self-healing) em vez de ficar com só metade rodando
# silenciosamente.
wait -n
exit $?
