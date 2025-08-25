# SanNext

Funções serverless e front-end para a fila virtual SuaVez.

## Reset de Monitor

A função `deleteMonitorConfig` apaga o registro do monitor e **todas** as chaves `tenant:{token}:*` associadas no Redis.
Esse reset remove contadores, senha, label, tickets e logs, utilizando `SCAN`/`DEL` para eliminar também conjuntos e hashes da fila.

Após o reset, todos os links do monitor e do cliente ficam inválidos e nenhum dado da fila é preservado..
