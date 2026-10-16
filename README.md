# SchoolLink HXV — estrutura inicial

## Arquivos
- `eventos.html`: exemplo de página com o padrão visual.
- `css/style.css`: CSS externo compartilhado e responsivo.
- `js/main.js`: menu mobile e comportamento de voltar ao topo.
- `img/`: coloque aqui imagens locais, por exemplo `sematec.jpg`.

## Como abrir
Abra `eventos.html` no navegador. Para o CSS e o JavaScript funcionarem, mantenha a estrutura de pastas.

## Como criar uma nova página
1. Duplique `eventos.html` e renomeie (por exemplo, `horarios.html`).
2. Mantenha os links para `css/style.css` e `js/main.js`.
3. Altere o `<title>`, o `aria-current="page"` e o conteúdo dentro de `<main>`.
4. No menu principal e na navegação mobile, ajuste os links e marque a página atual com `aria-current="page"`.
5. Para destacar a página atual na navegação mobile, o JavaScript também identifica o arquivo atual automaticamente pelo nome.

## Classes reutilizáveis
- Layout: `.container`, `.page-content`, `.page-intro`, `.section-block`
- Cartões: `.card`, `.card-grid`, `.schedule-card`, `.past-event`, `.card-body`
- Elementos: `.eyebrow`, `.tag`, `.tag-red`, `.button`, `.button-primary`, `.button-secondary`
- Cabeçalho/rodapé: `.site-header`, `.primary-nav`, `.mobile-nav`, `.site-footer`

## Observações
- Os dados do SEMATEC no HTML são conteúdo demonstrativo; substitua datas, descrições, links e imagens por informações confirmadas.
- O caminho `img/sematec.jpg` é apenas um local esperado para sua imagem; crie a pasta e coloque o arquivo.
- O projeto usa fontes Google Fonts como aprimoramento visual, mas tem fontes alternativas locais no CSS.
