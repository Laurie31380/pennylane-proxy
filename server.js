const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));
app.use(express.json());

const PENNYLANE_BASE = "https://app.pennylane.com/api/external/v2";

async function pennylaneGet(path, token, params = {}) {
  const url = new URL(`${PENNYLANE_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pennylane ${res.status}: ${err}`);
  }
  return res.json();
}

app.get("/api/ping", async (req, res) => {
  const { token } = req.headers;
  if (!token) return res.status(400).json({ error: "Token manquant" });
  try {
    await pennylaneGet("/customer_invoices", token, { per_page: 1 });
    res.json({ ok: true, message: "Connexion Pennylane réussie ✓" });
  } catch (e) {
    res.status(401).json({ ok: false, error: e.message });
  }
});

app.get("/api/customer_invoices", async (req, res) => {
  const token = req.headers.token;
  if (!token) return res.status(400).json({ error: "Token manquant" });
  try {
    const { label, page = 1, per_page = 100 } = req.query;
    const data = await pennylaneGet("/customer_invoices", token, {
      page, per_page,
      ...(label ? { "filter[label]": label } : {}),
    });
    const invoices = (data.customer_invoices || []).map((inv) => ({
      id: inv.id, type: "client",
      label: inv.label || inv.invoice_number,
      amount: parseFloat(inv.currency_amount_before_tax || 0),
      date: inv.date, status: inv.paid ? "payée" : "en attente",
    }));
    res.json({ invoices });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/supplier_invoices", async (req, res) => {
  const token = req.headers.token;
  if (!token) return res.status(400).json({ error: "Token manquant" });
  try {
    const { label, page = 1, per_page = 100 } = req.query;
    const data = await pennylaneGet("/supplier_invoices", token, {
      page, per_page,
      ...(label ? { "filter[label]": label } : {}),
    });
    const invoices = (data.supplier_invoices || []).map((inv) => ({
      id: inv.id, type: "fournisseur",
      label: inv.label || inv.invoice_number,
      amount: parseFloat(inv.currency_amount_before_tax || 0),
      date: inv.date, status: inv.paid ? "payée" : "en attente",
    }));
    res.json({ invoices });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/chantier_invoices", async (req, res) => {
  const token = req.headers.token;
  if (!token) return res.status(400).json({ error: "Token manquant" });
  try {
    const { tag } = req.query;
    if (!tag) return res.status(400).json({ error: "Paramètre tag manquant" });
    const [clientData, fournisseurData] = await Promise.all([
      pennylaneGet("/customer_invoices", token, { per_page: 200, "filter[label]": tag }),
      pennylaneGet("/supplier_invoices", token, { per_page: 200, "filter[label]": tag }),
    ]);
    const clientInvoices = (clientData.customer_invoices || []).map((inv) => ({
      id: inv.id, type: "client",
      label: inv.label || inv.invoice_number,
      amount: parseFloat(inv.currency_amount_before_tax || 0),
      date: inv.date, status: inv.paid ? "payée" : "en attente",
    }));
    const fournisseurInvoices = (fournisseurData.supplier_invoices || []).map((inv) => ({
      id: inv.id, type: "fournisseur",
      label: inv.label || inv.invoice_number,
      amount: parseFloat(inv.currency_amount_before_tax || 0),
      date: inv.date, status: inv.paid ? "payée" : "en attente",
    }));
    res.json({
      invoices: [...clientInvoices, ...fournisseurInvoices].sort((a, b) => b.date.localeCompare(a.date)),
      total_client: clientInvoices.reduce((s, i) => s + i.amount, 0),
      total_fournisseur: fournisseurInvoices.reduce((s, i) => s + i.amount, 0),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/transactions", async (req, res) => {
  const token = req.headers.token;
  if (!token) return res.status(400).json({ error: "Token manquant" });
  try {
    const { page = 1, per_page = 200 } = req.query;
    const data = await pennylaneGet("/transactions", token, { page, per_page });
    const transactions = (data.transactions || []).map((t) => ({
      id: t.id, date: t.date, label: t.label,
      amount: Math.abs(parseFloat(t.amount || 0)),
      type: parseFloat(t.amount) >= 0 ? "encaissement" : "decaissement",
    }));
    res.json({ transactions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/bank_accounts", async (req, res) => {
  const token = req.headers.token;
  if (!token) return res.status(400).json({ error: "Token manquant" });
  try {
    const data = await pennylaneGet("/bank_accounts", token, {});
    const accounts = (data.bank_accounts || []).map((a) => ({
      id: a.id, name: a.name,
      balance: parseFloat(a.balance || 0),
    }));
    res.json({ accounts, total_balance: accounts.reduce((s, a) => s + a.balance, 0) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "OK", message: "Groupe Laurentie — Pennylane Proxy v1.0" });
});

app.listen(PORT, () => console.log(`✅ Serveur démarré sur le port ${PORT}`));
