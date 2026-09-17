/**
 * Verif K7 - Export de données
 * -----------------------------
 * Ce script s'exécute directement dans le contexte de la page (world: "MAIN"),
 * ce qui lui permet de lire la configuration du tableau (jQuery EasyUI "datagrid")
 * déjà chargé par l'application : l'URL de son API (/miniclick/json), le viewId,
 * le moduleId et la liste des colonnes.
 *
 * Il rappelle ensuite cette même API (avec la session déjà ouverte dans le
 * navigateur, donc sans identifiants supplémentaires) pour récupérer TOUTES les
 * pages du tableau actuellement affiché (avec son filtre / sa vue en cours),
 * puis propose un téléchargement en JSON ou CSV.
 *
 * Fonctionne sur n'importe quel module du portail qui utilise ce même
 * composant de tableau (pas seulement "tarifs tiers").
 */
(function () {
  if (window.__vk7ExporterInjected) return;
  window.__vk7ExporterInjected = true;

  const PAGE_SIZE = 100;
  const SOCIETE_FIELD = "societeId";
  const SOCIETE_OPTIONS = ["KA", "NE", "PA", "SA", "SE", "SO", "TT", "TOUT"];
  const DEFAULT_SOCIETE = "KA";
  const PAGE_WARN_THRESHOLD = 200;

  const LS_URL = "vk7_server_url";
  const LS_KEY = "vk7_api_key";
  const LS_PUSH = "vk7_auto_push";

  function lireConfig() {
    try {
      return {
        url: localStorage.getItem(LS_URL) || "",
        key: localStorage.getItem(LS_KEY) || "",
        push: localStorage.getItem(LS_PUSH) !== "0",
      };
    } catch {
      return { url: "", key: "", push: true };
    }
  }

  function sauverConfig(url, key, push) {
    try {
      localStorage.setItem(LS_URL, url);
      localStorage.setItem(LS_KEY, key);
      localStorage.setItem(LS_PUSH, push ? "1" : "0");
    } catch {}
  }

  async function pousserVersServeur(payload) {
    const cfg = lireConfig();
    if (!cfg.url || !cfg.push) return null;
    const reponse = await fetch(cfg.url.replace(/\/$/, "") + "/api/import/tarifs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": cfg.key },
      body: JSON.stringify(payload),
    });
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null);
      throw new Error((corps && corps.erreur) || `HTTP ${reponse.status}`);
    }
    return await reponse.json();
  }

  function findDataGrid() {
    if (typeof jQuery === "undefined") return null;
    let found = null;
    jQuery("table").each(function () {
      const dg = jQuery(this).data("datagrid");
      if (dg && dg.options && dg.options.queryParams && dg.options.url) {
        found = dg;
        return false; // stoppe le .each
      }
    });
    return found;
  }

  function buildFieldMap(dg) {
    const map = {};
    const groups = dg.options.columns || [];
    groups.forEach((group) => {
      group.forEach((col) => {
        if (col.field) {
          map[col.field] = (col.title || col.field).replace(/\s+/g, " ").trim();
        }
      });
    });
    return map;
  }

  async function fetchPageOnce(url, params) {
    const body = new URLSearchParams(params);
    const resp = await fetch(url + "?" + body.toString(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Réponse non-JSON du serveur (erreur transitoire probable)");
    }
  }

  // Le serveur renvoie de temps en temps une erreur (HTTP 500) sur une page
  // précise, de façon reproductible : elle vient d'un enregistrement précis
  // dont le contenu fait planter le serveur au moment de le sérialiser (pas
  // d'un aléa réseau). Une seule petite retentative suffit pour absorber un
  // vrai aléa réseau ; au-delà, mieux vaut subdiviser la page (voir
  // fetchWindowRobust) pour isoler l'enregistrement fautif plutôt que de
  // réessayer indéfiniment la même requête qui échouera à nouveau.
  async function fetchPage(url, params, retries = 2) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fetchPageOnce(url, params);
      } catch (e) {
        lastErr = e;
        if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    throw lastErr;
  }

  // Récupère une "fenêtre" de résultats (page/taille donnée) ; si la requête
  // échoue malgré les quelques retentatives de fetchPage, on subdivise la
  // fenêtre en 10 sous-requêtes plus petites (100 -> 10 -> 1 ligne), jusqu'à
  // isoler précisément la ou les lignes fautives, qui sont alors signalées
  // comme "ignorées" plutôt que de faire échouer toute l'extraction.
  async function fetchWindowRobust(url, qp, filterRules, page, size) {
    const reqParams = Object.assign({}, qp, { page, rows: size });
    if (filterRules) reqParams.filterRules = filterRules;
    try {
      const data = await fetchPage(url, reqParams);
      return { rows: (data && data.rows) || [], skipped: [] };
    } catch (e) {
      if (size === 1) {
        return { rows: [], skipped: [{ page, size }] };
      }
      const nextSize = size === 100 ? 10 : 1;
      const factor = size / nextSize;
      let rows = [];
      let skipped = [];
      for (let i = 0; i < factor; i++) {
        const subPage = (page - 1) * factor + i + 1;
        const sub = await fetchWindowRobust(url, qp, filterRules, subPage, nextSize);
        rows = rows.concat(sub.rows);
        skipped = skipped.concat(sub.skipped);
      }
      return { rows, skipped };
    }
  }

  function triggerDownload(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function toCSV(rows, fieldMap) {
    const fields = Object.keys(fieldMap);
    const header = fields.map((f) => fieldMap[f]).join(";");
    const lines = rows.map((r) =>
      fields
        .map((f) => {
          let v = r[f];
          if (v === undefined || v === null) v = "";
          v = String(v).replace(/"/g, '""');
          if (/[;"\n]/.test(v)) v = '"' + v + '"';
          return v;
        })
        .join(";")
    );
    return [header, ...lines].join("\n");
  }

  async function exportAll(format) {
    const dg = findDataGrid();
    if (!dg) {
      alert("Aucun tableau de données détecté sur cette page.");
      return;
    }
    const qp = dg.options.queryParams;
    const url = dg.options.url;
    const fieldMap = buildFieldMap(dg);
    const btn = document.getElementById("vk7-export-btn");
    const btnCsv = document.getElementById("vk7-export-csv");
    const societeSelect = document.getElementById("vk7-societe-filter");
    const societe = societeSelect ? societeSelect.value : DEFAULT_SOCIETE;
    if (btn) btn.disabled = true;
    if (btnCsv) btnCsv.disabled = true;

    // Filtre société appliqué CÔTÉ SERVEUR (même mécanisme que la case de
    // filtre de la grille : paramètre "filterRules"), pour ne récupérer que
    // les pages qui nous intéressent au lieu de tout le module puis filtrer.
    const filterRules =
      societe && societe !== "TOUT" ? JSON.stringify([{ field: SOCIETE_FIELD, op: "equal", value: societe }]) : null;

    // Le serveur de ce portail renvoie parfois une erreur (HTTP 500) causée par
    // un enregistrement précis qui le fait planter à la sérialisation — pas un
    // aléa réseau. Quand une page de 100 échoue, fetchWindowRobust() la
    // subdivise automatiquement (100 -> 10 -> 1 ligne) pour isoler et signaler
    // uniquement la/les ligne(s) fautive(s), sans perdre le reste des données.
    let allRows = [];
    let expectedTotal = null;
    let aborted = false;
    let skippedRecords = [];

    // Première page : sert aussi à connaître le nombre total de lignes/pages
    // attendues (champ "total__row" du pied de tableau), pour pouvoir boucler
    // sur un nombre de pages connu à l'avance plutôt que "jusqu'à page vide".
    let totalPages = null;
    let first;
    try {
      first = await fetchWindowRobust(url, qp, filterRules, 1, PAGE_SIZE);
      allRows = allRows.concat(first.rows);
      skippedRecords = skippedRecords.concat(first.skipped);
      // Requête légère supplémentaire (rows=1) juste pour lire le total, puisque
      // fetchWindowRobust ne remonte pas le pied de tableau (surtout s'il a dû
      // subdiviser la page).
      try {
        const reqParamsMeta = Object.assign({}, qp, { page: 1, rows: 1 });
        if (filterRules) reqParamsMeta.filterRules = filterRules;
        const meta = await fetchPageOnce(url, reqParamsMeta);
        if (meta && meta.footer && meta.footer[0] && meta.footer[0].total__row != null) {
          const t = parseInt(meta.footer[0].total__row, 10);
          if (!isNaN(t)) expectedTotal = t;
        }
      } catch (e) {
        // pas grave : on basculera sur le mode "total inconnu" ci-dessous
      }
    } catch (e) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "📦 Exporter (JSON)";
      }
      if (btnCsv) btnCsv.disabled = false;
      alert("Impossible de récupérer la première page : " + e.message + "\nRéessayez dans quelques instants.");
      return;
    }

    totalPages = expectedTotal !== null ? Math.max(1, Math.ceil(expectedTotal / PAGE_SIZE)) : null;

    // Garde-fou : si le filtre ne réduit pas vraiment le volume (ex. champ absent
    // sur ce module, ou société "TOUT"), on redemande confirmation avant de
    // partir sur une extraction de plusieurs milliers de pages.
    if (totalPages !== null && totalPages > PAGE_WARN_THRESHOLD) {
      const cont = confirm(
        `Cette extraction va porter sur environ ${expectedTotal} lignes (~${totalPages} pages).\n` +
          `Vérifiez que le filtre société (${societe}) s'applique bien sur ce module.\n\n` +
          `Continuer quand même ?`
      );
      if (!cont) aborted = true;
    }

    if (!aborted) {
      if (totalPages !== null) {
        // Nombre de pages connu à l'avance : on boucle dessus.
        for (let page = 2; page <= totalPages; page++) {
          if (btn) btn.textContent = `Extraction… page ${page}/${totalPages}`;
          const win = await fetchWindowRobust(url, qp, filterRules, page, PAGE_SIZE);
          allRows = allRows.concat(win.rows);
          skippedRecords = skippedRecords.concat(win.skipped);
          await new Promise((r) => setTimeout(r, 250)); // pause pour ne pas surcharger le serveur
        }
      } else {
        // Total inconnu (pas de pied de tableau) : on avance tant que la
        // fenêtre précédente était pleine (100 emplacements, qu'ils aient été
        // récupérés ou signalés comme ignorés) — une page pleine signifie
        // qu'il peut encore y avoir une page suivante.
        let page = 2;
        let previousWindowFull = first.rows.length + first.skipped.length === PAGE_SIZE;
        while (previousWindowFull) {
          if (btn) btn.textContent = `Extraction… page ${page}`;
          const win = await fetchWindowRobust(url, qp, filterRules, page, PAGE_SIZE);
          allRows = allRows.concat(win.rows);
          skippedRecords = skippedRecords.concat(win.skipped);
          previousWindowFull = win.rows.length + win.skipped.length === PAGE_SIZE;
          page += 1;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = "📦 Exporter (JSON)";
    }
    if (btnCsv) btnCsv.disabled = false;

    if (aborted) {
      alert("Extraction annulée.");
      return;
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const societeSuffix = filterRules ? `_${societe}` : "";
    const baseName = `verifk7_module${qp.moduleId}_view${qp.viewId}${societeSuffix}_${stamp}`;

    const payload = {
      source: location.href,
      moduleId: qp.moduleId,
      viewId: qp.viewId,
      societeFilter: filterRules ? societe : null,
      expectedTotal,
      skippedRecords,
      extractedAt: new Date().toISOString(),
      totalRecords: allRows.length,
      fields: fieldMap,
      rows: allRows,
    };

    if (format === "json") {
      triggerDownload(baseName + ".json", JSON.stringify(payload, null, 2), "application/json");
    } else {
      triggerDownload(baseName + ".csv", toCSV(allRows, fieldMap), "text/csv;charset=utf-8");
    }

    let msg = `Extraction terminée : ${allRows.length} ligne(s) exportée(s)${filterRules ? " (société " + societe + ")" : ""}.`;
    if (expectedTotal !== null) msg += ` Attendu : ${expectedTotal}.`;
    if (skippedRecords.length > 0) {
      msg +=
        `\n\nAttention : ${skippedRecords.length} enregistrement(s) n'ont pas pu être récupérés ` +
        `(le serveur renvoie une erreur sur ces lignes précises, probablement une donnée corrompue côté application — ` +
        `à signaler au développeur de l'outil). Détail dans le fichier JSON exporté (clé "skippedRecords").`;
    }

    const statutEl = document.getElementById("vk7-push-statut");

    if (format === "json" && lireConfig().push && lireConfig().url) {
      if (statutEl) {
        statutEl.textContent = "⏳ Envoi vers serveur…";
        statutEl.style.color = "#555";
        statutEl.style.display = "block";
      }
      try {
        const res = await pousserVersServeur(payload);
        if (statutEl && res) {
          statutEl.textContent = `✅ Catalogue mis à jour (${res.tarifs} tarifs, ${res.produits} produits)`;
          statutEl.style.color = "#166534";
        }
        msg += `\n\nCatalogue mis à jour sur le serveur : ${res.tarifs} tarifs.`;
      } catch (e) {
        if (statutEl) {
          statutEl.textContent = `❌ Echec envoi : ${e.message}`;
          statutEl.style.color = "#991b1b";
        }
        msg += `\n\nEchec de l'envoi vers le serveur : ${e.message}`;
      }
    } else {
      if (statutEl) statutEl.style.display = "none";
    }

    alert(msg);
  }

  function injectUI() {
    if (document.getElementById("vk7-export-panel")) return;
    const dg = findDataGrid();
    if (!dg) return;

    const cfg = lireConfig();

    // Conteneur principal (vertical : barre + config + statut)
    const wrapper = document.createElement("div");
    wrapper.id = "vk7-export-panel";
    wrapper.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:999999;background:#fff;border:1px solid #ccc;" +
      "border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-family:sans-serif;font-size:13px;" +
      "min-width:280px;";

    // --- Barre principale ---
    const barre = document.createElement("div");
    barre.style.cssText = "display:flex;gap:6px;align-items:center;padding:8px;";

    const label = document.createElement("label");
    label.textContent = "Société :";
    label.style.cssText = "font-size:12px;color:#555;white-space:nowrap;";

    const select = document.createElement("select");
    select.id = "vk7-societe-filter";
    select.style.cssText = "padding:4px;border:1px solid #888;border-radius:4px;";
    SOCIETE_OPTIONS.forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code === "TOUT" ? "Toutes" : code;
      if (code === DEFAULT_SOCIETE) opt.selected = true;
      select.appendChild(opt);
    });

    const btnStyle = "cursor:pointer;padding:6px 10px;border:1px solid #888;border-radius:4px;background:#f5f5f5;";

    const btn = document.createElement("button");
    btn.id = "vk7-export-btn";
    btn.textContent = "📦 Exporter (JSON)";
    btn.style.cssText = btnStyle;
    btn.onclick = () => exportAll("json");

    const btnCsv = document.createElement("button");
    btnCsv.id = "vk7-export-csv";
    btnCsv.textContent = "CSV";
    btnCsv.style.cssText = btnStyle;
    btnCsv.onclick = () => exportAll("csv");

    const btnCfg = document.createElement("button");
    btnCfg.title = "Configurer l'envoi vers le serveur";
    btnCfg.textContent = "⚙️";
    btnCfg.style.cssText = btnStyle + "padding:4px 7px;";

    barre.appendChild(label);
    barre.appendChild(select);
    barre.appendChild(btn);
    barre.appendChild(btnCsv);
    barre.appendChild(btnCfg);

    // --- Panneau de config (masqué par défaut) ---
    const panCfg = document.createElement("div");
    panCfg.id = "vk7-config-panel";
    panCfg.style.cssText =
      "display:none;border-top:1px solid #eee;padding:10px;background:#fafafa;border-radius:0 0 8px 8px;";

    function champTexte(id, libelle, valeurInitiale, placeholder) {
      const row = document.createElement("div");
      row.style.cssText = "margin-bottom:8px;";
      const lbl = document.createElement("label");
      lbl.textContent = libelle;
      lbl.style.cssText = "display:block;font-size:11px;color:#555;margin-bottom:3px;";
      const inp = document.createElement("input");
      inp.id = id;
      inp.type = "text";
      inp.value = valeurInitiale;
      inp.placeholder = placeholder;
      inp.style.cssText = "width:100%;box-sizing:border-box;padding:5px;border:1px solid #ccc;border-radius:4px;font-size:12px;";
      row.appendChild(lbl);
      row.appendChild(inp);
      return row;
    }

    panCfg.appendChild(champTexte("vk7-cfg-url", "URL du serveur", cfg.url, "https://verif.exemple.com"));
    panCfg.appendChild(champTexte("vk7-cfg-key", "Clé API (X-Api-Key)", cfg.key, ""));

    const rowPush = document.createElement("div");
    rowPush.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:8px;";
    const chkPush = document.createElement("input");
    chkPush.id = "vk7-cfg-push";
    chkPush.type = "checkbox";
    chkPush.checked = cfg.push;
    const lblPush = document.createElement("label");
    lblPush.htmlFor = "vk7-cfg-push";
    lblPush.textContent = "Pousser vers le serveur après export JSON";
    lblPush.style.cssText = "font-size:12px;color:#333;cursor:pointer;";
    rowPush.appendChild(chkPush);
    rowPush.appendChild(lblPush);
    panCfg.appendChild(rowPush);

    const btnSauver = document.createElement("button");
    btnSauver.textContent = "Enregistrer";
    btnSauver.style.cssText = btnStyle + "font-size:12px;";
    btnSauver.onclick = () => {
      const url = (document.getElementById("vk7-cfg-url") || {}).value || "";
      const key = (document.getElementById("vk7-cfg-key") || {}).value || "";
      const push = (document.getElementById("vk7-cfg-push") || {}).checked !== false;
      sauverConfig(url.trim(), key.trim(), push);
      panCfg.style.display = "none";
      btnCfg.style.outline = (url && push) ? "2px solid #166534" : "";
    };
    panCfg.appendChild(btnSauver);

    btnCfg.onclick = () => {
      panCfg.style.display = panCfg.style.display === "none" ? "block" : "none";
    };
    if (cfg.url && cfg.push) btnCfg.style.outline = "2px solid #166534";

    // --- Statut push ---
    const statutEl = document.createElement("div");
    statutEl.id = "vk7-push-statut";
    statutEl.style.cssText =
      "display:none;padding:6px 10px;font-size:12px;border-top:1px solid #eee;border-radius:0 0 8px 8px;";

    wrapper.appendChild(barre);
    wrapper.appendChild(panCfg);
    wrapper.appendChild(statutEl);
    document.body.appendChild(wrapper);
  }

  // Le tableau (datagrid) peut se charger un peu après le chargement de la page,
  // on retente donc l'injection du bouton pendant quelques secondes.
  const interval = setInterval(injectUI, 1000);
  setTimeout(() => clearInterval(interval), 20000);
})();
