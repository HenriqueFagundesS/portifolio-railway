# Como subir este portfólio no Railway

## 1. Criar o projeto
1. Entre no Railway.
2. Crie um novo projeto.
3. Conecte este repositório do GitHub.

## 2. Adicionar banco PostgreSQL
1. Dentro do projeto no Railway, clique em `New`.
2. Escolha `Database`.
3. Escolha `PostgreSQL`.
4. O Railway vai criar automaticamente a variável `DATABASE_URL`.

## 3. Fazer deploy
O Railway vai detectar o Node.js pelo `package.json`.
O comando usado será:

```bash
npm start
```

## 4. Ver as mensagens enviadas
Você pode ver de duas formas:

### Pelo Railway
Abra o banco PostgreSQL no Railway e procure a tabela:

```sql
contatos
```

### Pela rota da API
Acesse:

```txt
https://SEU-LINK-DO-RAILWAY.up.railway.app/api/contatos
```

Ela retorna todas as mensagens em JSON.

## 5. Testar localmente
Instale as dependências:

```bash
npm install
```

Crie um arquivo `.env` baseado no `.env.example`.
Depois rode:

```bash
npm run dev
```

Abra:

```txt
http://localhost:3000
```
