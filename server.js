const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

async function criarTabela() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contatos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL,
      mensagem TEXT NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

app.get('/api/status', (req, res) => {
  res.json({ mensagem: 'API funcionando' });
});

app.post('/api/contato', async (req, res) => {
  try {
    const { nome, email, mensagem } = req.body;

    if (!nome || !email || !mensagem) {
      return res.status(400).json({
        erro: 'Preencha nome, email e mensagem.',
      });
    }

    const emailValido =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!emailValido) {
      return res.status(400).json({
        erro: 'Digite um email válido.',
      });
    }

    // salva no banco
    await pool.query(
      'INSERT INTO contatos (nome, email, mensagem) VALUES ($1, $2, $3)',
      [
        nome.trim(),
        email.trim(),
        mensagem.trim()
      ]
    );

    // envia email pra você
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'henriquedesouza245@gmail.com',
      subject: 'Nova mensagem no portfólio',
      html: `
        <h2>Nova mensagem recebida</h2>

        <p><strong>Nome:</strong> ${nome}</p>

        <p><strong>Email:</strong> ${email}</p>

        <p><strong>Mensagem:</strong></p>

        <div style="padding:10px;border:1px solid #ccc">
          ${mensagem}
        </div>
      `
    });

    res.status(201).json({
      mensagem: 'Mensagem enviada com sucesso!'
    });

  } catch (error) {
    console.error(
      'Erro ao salvar contato:',
      error
    );

    res.status(500).json({
      erro: 'Erro ao enviar mensagem.'
    });
  }
});

app.get('/api/contatos', async (req, res) => {
  try {

    const resultado = await pool.query(
      `SELECT
      id,
      nome,
      email,
      mensagem,
      criado_em
      FROM contatos
      ORDER BY criado_em DESC`
    );

    res.json(resultado.rows);

  } catch (error) {

    console.error(
      'Erro ao buscar contatos:',
      error
    );

    res.status(500).json({
      erro:'Erro ao buscar mensagens.'
    });
  }
});

criarTabela()
  .then(() => {

    app.listen(PORT, () => {
      console.log(
        `Servidor rodando na porta ${PORT}`
      );
    });

  })
  .catch((error) => {

    console.error(
      'Erro ao conectar no banco:',
      error
    );

    process.exit(1);
  });