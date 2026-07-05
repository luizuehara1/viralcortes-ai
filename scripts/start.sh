#!/bin/bash
# Sobe o painel Next.js e o worker do BullMQ no mesmo container/serviço do
# Railway — assim os dois enxergam o mesmo disco (uploads/ e clips/), sem
# depender de Volume compartilhado entre serviços separados.
set -m

# Aviso alto de "storage não é persistente": UPLOAD_DIR/CLIPS_DIR apontando
# pra um caminho tipo /app/data/uploads SÓ sobrevive a um novo deploy se um
# Volume do Railway estiver de fato montado nesse caminho — só configurar a
# variável de ambiente não é suficiente. Um Volume montado aparece num
# dispositivo (st_dev) diferente da imagem do container; se for o mesmo
# dispositivo de /app, é só uma pasta comum que o próximo deploy apaga
# igual ao resto da imagem. Detecta isso ANTES de perder dados de novo, em
# vez de só descobrir quando um vídeo já enviado sumir.
check_persistent_mount() {
  local label="$1" dir="$2"
  mkdir -p "$dir" 2>/dev/null
  local app_dev dir_dev
  app_dev=$(stat -c %d /app 2>/dev/null)
  dir_dev=$(stat -c %d "$dir" 2>/dev/null)
  if [ -n "$app_dev" ] && [ -n "$dir_dev" ] && [ "$app_dev" = "$dir_dev" ]; then
    echo "############################################################"
    echo "# AVISO: $label ($dir) NÃO está num Volume persistente."
    echo "# Está no mesmo filesystem da imagem do container — o próximo"
    echo "# deploy vai apagar tudo aqui dentro (é exatamente o bug de"
    echo "# 'arquivo de vídeo não encontrado' após cada deploy)."
    echo "# Configure um Volume no Railway montado em $dir (Settings ->"
    echo "# Volumes) e confirme que a env var aponta pro MESMO caminho."
    echo "############################################################"
  else
    echo "[start.sh] $label ($dir) parece estar num Volume persistente (ok)."
  fi
}

check_persistent_mount "UPLOAD_DIR" "${UPLOAD_DIR:-/app/uploads}"
check_persistent_mount "CLIPS_DIR" "${CLIPS_DIR:-/app/clips}"

npm run worker &
npm run start &

# Se qualquer um dos dois cair, derruba o container inteiro — o Railway
# reinicia o serviço (self-healing) em vez de ficar com só metade rodando
# silenciosamente.
wait -n
exit $?
