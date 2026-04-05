# Manuscrit

Ferramenta de análise e edição de manuscritos em português.

## Funcionalidades

- **Score Geral** — painel consolidado com nota por categoria
- **Escrita Forte** — Filler Words, Voz Passiva, Show vs Tell, Clichês
- **Diálogo** — Dialogue Tags, Advérbios
- **Escolha de Palavras** — Descrições Genéricas
- **Repetição** — Word Echoes
- **Ritmo & Estrutura** — Pacing Heatmap, Variação de Frases, Frequência, Inícios de Frase
- **Análise com IA** — Crítica Editorial, Beta Reader
- **Market Fuel** — Gênero, categorias Amazon KDP, tropos, keywords, comp titles
- **Detector de IA** — Vícios de linguagem de IA, Score de autenticidade
- **Meu Estilo** — Comparador calibrado com suas obras de referência

## Instalação

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18 ou superior
- Uma [chave de API da Anthropic](https://console.anthropic.com/)

### Passos

```bash
# 1. Entre na pasta do projeto
cd manuscrit

# 2. Instale as dependências
npm install

# 3. Configure a chave de API
cp .env.example .env
# Abra o arquivo .env e substitua sk-ant-sua-chave-aqui pela sua chave real

# 4. Rode o servidor de desenvolvimento
npm run dev
```

Acesse em **http://localhost:5173**

## Como usar

1. Cole o texto do seu manuscrito (capítulo ou livro inteiro) na área de texto
2. Clique em **ANALISAR**
3. Navegue pelos relatórios na sidebar
4. Os relatórios de texto (Escrita Forte, Diálogo, etc.) funcionam offline — são instantâneos
5. Os relatórios de IA (Crítica Editorial, Market Fuel, etc.) fazem chamadas à API da Anthropic

## Observações sobre textos longos

- Relatórios de regras (Filler Words, Voz Passiva, etc.) funcionam em qualquer tamanho
- O **Pacing Heatmap** pode ser lento em textos com 500+ parágrafos
- As chamadas de IA truncam automaticamente nos primeiros 120.000 caracteres

## Estrutura do projeto

```
manuscrit/
├── index.html          # Entry point
├── vite.config.js      # Configuração do Vite + proxy para a API
├── package.json
├── .env                # Sua chave de API (não commitar!)
├── .env.example        # Template da variável de ambiente
└── src/
    ├── main.jsx        # Bootstrap do React
    └── App.jsx         # App completo
```

## Segurança

A chave de API é adicionada pelo servidor proxy do Vite e **nunca aparece no código do browser**. O arquivo `.env` está no `.gitignore` para não ser commitado acidentalmente.
