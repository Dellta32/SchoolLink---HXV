# SchoolLink HXV — Design baseado nos protótipos Stitch

Projeto estático HTML/CSS/JavaScript. O design compartilhado está consolidado em `style.css`.

## Como abrir
Abra `index.html` no navegador. Para melhor funcionamento dos recursos, use um servidor local estático.

## Navegação responsiva
- Desktop: links no cabeçalho.
- Mobile: barra inferior fixa.
- Sem menu hambúrguer e sem campo de pesquisa.

As páginas e os conteúdos originais foram preservados e receberam uma camada visual unificada inspirada nos protótipos Stitch de Home, Eventos, Sobre, Gestão, Horários e ENEM.


## Integração inicial com Supabase (Storage)

Foi adicionada a inicialização do cliente Supabase na página `corpo-docente.html`.
Para configurar:

1. Abra `supabase-config.js`.
2. Substitua `COLE_AQUI_A_PROJECT_URL` pela API URL/Project URL do seu projeto Supabase.
3. Substitua `COLE_AQUI_A_PUBLISHABLE_KEY` pela chave pública `sb_publishable_...`.
4. Salve e publique o projeto no GitHub Pages.

**Nunca** use `Secret key` ou `service_role` em arquivos JavaScript publicados.

Esta alteração apenas inicializa o cliente. O bucket `schoollink-arquivos` continua privado e nenhum upload foi migrado ainda. Antes de habilitar upload/download, será necessário implementar e configurar uma Supabase Edge Function que valide o token do Firebase e aplique as permissões do SchoolLink. Não crie políticas públicas no Storage.

### Observação importante sobre o Firestore

O código atual consulta a coleção `publicacoes` (sem acento) em `js/corpo-docente.js` e `js/alunos.js`. Nas capturas do Console, a coleção existente aparece como `publicações` (com acento). O nome precisa ser padronizado antes de conectar as publicações reais; nomes de coleção são sensíveis a acentos e caracteres.
