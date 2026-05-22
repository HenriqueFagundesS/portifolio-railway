const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { Resend } = require('resend');
const helmet = require('helmet');           // 🆕
const rateLimit = require('express-rate-limit'); // 🆕
const crypto = require('crypto');           // 🆕 nativo do Node
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ FIX 1 — Headers de segurança HTTP (XSS, clickjacking, sniffing, etc.)
app.use(helmet());

// ✅ FIX 2 — CORS restrito ao seu domínio, não aberto para qualquer origem
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN,
  methods: ['GET', 'POST'],
}));

// ✅ FIX 3 — Limita tamanho do body (evita DoS por payload gigante)
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname)));

// ✅ FIX 4 — Rate limiting: evita spam e força bruta
const limiteContato = rateLimit({
  windowMs: 15 * 60 * 1000, // janela de 15 min
  max: 5,                    // máx 5 envios por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde 15 minutos.' },
});

const limiteAdmin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { erro: 'Muitas tentativas.' },
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false } // Railway usa certificado autoassinado
    : false,
});




// ✅ FIX 6 — Escapa HTML para evitar XSS no email enviado via Resend
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ✅ FIX 7 — Comparação segura contra timing attacks na rota admin
function comparacaoSegura(a, b) {
  if (!a || !b) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

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

app.post('/api/contato', limiteContato, async (req, res) => {
  try {
    const { nome, email, mensagem } = req.body;

    // ✅ Validação de presença
    if (!nome || !email || !mensagem) {
      return res.status(400).json({ erro: 'Preencha nome, email e mensagem.' });
    }

    // ✅ Validação de tipos (evita ataques com arrays/objetos)
    if (typeof nome !== 'string' || typeof email !== 'string' || typeof mensagem !== 'string') {
      return res.status(400).json({ erro: 'Dados inválidos.' });
    }

    // ✅ Validação de tamanho (consistente com o schema do banco)
    if (nome.trim().length < 2 || nome.trim().length > 100) {
      return res.status(400).json({ erro: 'Nome deve ter entre 2 e 100 caracteres.' });
    }
    if (email.trim().length > 150) {
      return res.status(400).json({ erro: 'Email muito longo.' });
    }
    if (mensagem.trim().length < 10 || mensagem.trim().length > 5000) {
      return res.status(400).json({ erro: 'Mensagem deve ter entre 10 e 5000 caracteres.' });
    }

    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailValido) {
      return res.status(400).json({ erro: 'Digite um email válido.' });
    }

    const nomeFinal     = nome.trim();
    const emailFinal    = email.trim().toLowerCase();
    const mensagemFinal = mensagem.trim();

    // Salva no banco (já protegido contra SQL Injection por parâmetros)
    await pool.query(
      'INSERT INTO contatos (nome, email, mensagem) VALUES ($1, $2, $3)',
      [nomeFinal, emailFinal, mensagemFinal]
    );

    // ✅ FIX 6 — HTML do email com escape de todas as variáveis do usuário
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: process.env.EMAIL_DESTINO, // ✅ email fora do código-fonte
      subject: 'Nova mensagem no portfólio',
      html: `
        <h2>Nova mensagem recebida</h2>
        <p><strong>Nome:</strong> ${escapeHtml(nomeFinal)}</p>
        <p><strong>Email:</strong> ${escapeHtml(emailFinal)}</p>
        <p><strong>Mensagem:</strong></p>
        <div style="padding:10px;border:1px solid #ccc;white-space:pre-wrap">
          ${escapeHtml(mensagemFinal)}
        </div>
      `,
    });

    res.status(201).json({ mensagem: 'Mensagem enviada com sucesso!' });

  } catch (error) {
    console.error('Erro ao salvar contato:', error);
    // ✅ Nunca expõe detalhes do erro interno ao cliente
    res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
  }
});

app.get('/api/contatos', limiteAdmin, async (req, res) => {
  const chave = req.headers.authorization;

  // ✅ FIX 7 — Comparação segura (evita timing attack)
  if (!comparacaoSegura(chave, process.env.ADMIN_KEY)) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, mensagem, criado_em
       FROM contatos
       ORDER BY criado_em DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao buscar contatos:', error);
    res.status(500).json({ erro: 'Erro ao buscar mensagens.' });
  }
});

criarTabela()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Erro ao conectar no banco:', error);
    process.exit(1);
  });