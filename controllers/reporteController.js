const fs = require('fs');
const path = require('path');
const Evaluation = require('../models/Evaluation');

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateES(date) {
    const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    const d = new Date(date);
    return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function formatDateShort(date) {
    const d = new Date(date);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function nivelClase(pct) {
    if (pct >= 80) return 'badge-success';
    if (pct >= 60) return 'badge-warning';
    return 'badge-danger';
}

function nivelTexto(pct) {
    if (pct >= 80) return 'Ideal';
    if (pct >= 60) return 'Alerta';
    return 'Riesgo';
}

function barClase(pct) {
    if (pct >= 80) return 'perf-bar-ideal';
    if (pct >= 60) return 'perf-bar-alerta';
    return 'perf-bar-riesgo';
}

function nivelColor(pct) {
    if (pct >= 80) return '#16a34a';
    if (pct >= 60) return '#b45309';
    return '#dc2626';
}

const META = 80;

// ── Gráfica de dona SVG ────────────────────────────────────────────────────

function generarDonaFull(pct) {
    const r = 50, cx = 70, cy = 70, stroke = 16;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    const gap  = circ - dash;
    const strokeColor = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
    const textColor   = pct >= 80 ? '#16a34a' : pct >= 60 ? '#b45309' : '#dc2626';

    // Marca de meta al 80%
    const metaAngle = (80 / 100) * 2 * Math.PI - Math.PI / 2;
    const mx1 = cx + (r - stroke / 2) * Math.cos(metaAngle);
    const my1 = cy + (r - stroke / 2) * Math.sin(metaAngle);
    const mx2 = cx + (r + stroke / 2) * Math.cos(metaAngle);
    const my2 = cy + (r + stroke / 2) * Math.sin(metaAngle);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${stroke}"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${strokeColor}" stroke-width="${stroke}"
            stroke-linecap="round"
            stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
            transform="rotate(-90 ${cx} ${cy})"/>
        <text x="${cx}" y="${cy - 4}" text-anchor="middle"
            font-family="Inter,Arial,sans-serif" font-size="20" font-weight="800" fill="${textColor}">${pct}%</text>
        <text x="${cx}" y="${cy + 13}" text-anchor="middle"
            font-family="Inter,Arial,sans-serif" font-size="9" fill="#64748b">cumplimiento</text>
        <line x1="${mx1.toFixed(2)}" y1="${my1.toFixed(2)}" x2="${mx2.toFixed(2)}" y2="${my2.toFixed(2)}"
            stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
        <text x="${cx}" y="132" text-anchor="middle"
            font-family="Inter,Arial,sans-serif" font-size="8" fill="#64748b">▏ meta: ${META}%</text>
    </svg>`;
}

// ── Cálculo de porcentaje ──────────────────────────────────────────────────

function valorNivel(val) {
    if (!val) return null;
    const v = val.toLowerCase();
    if (v.includes('ideal') || v.includes('totalmente')) return 1;
    if (v.includes('alerta') || v.includes('parcial'))   return 0.5;
    if (v.includes('riesgo') || v === 'no')              return 0;
    return null;
}

function calcularPorcentaje(ev) {
    if (ev.calificacionTotal && ev.calificacionTotal > 0) {
        return Math.round(ev.calificacionTotal);
    }

    const proceso = ev.datosGenerales?.procesoEvaluado || '';
    let campos = [];

    if (proceso === 'Recuperación') {
        const r = ev.recuperacion || {};
        campos = [r.puntualidadAsesor, r.asistenciaGrupo, r.recuperacionPactado,
                  r.fichaCerrada, r.registroHojaControl, r.cotejoHojaControl, r.recibos];
    } else if (proceso === 'Renovación') {
        const r = ev.renovacion || {};
        campos = [r.documentacionSemana, r.asesoriaCliente, r.expedientesCompletos, r.valoracionRiesgo];
    } else if (proceso === 'Cobranza') {
        const c = ev.cobranza || {};
        campos = [c.diasAtraso, c.estrategiasASEC || c.estrategiasAsec, c.acciones, c.saldoVencido];
    } else if (proceso === 'Desembolso') {
        const d = ev.desembolsoCredito?.actividadesPrevias || {};
        campos = [d.dinamicaPresentacion, d.educacionFinanciera, d.devolucionGarantias,
                  d.comentariosReglamento, d.comentariosContrato, d.pagoSancionesSolidarios];
    }

    const validos = campos.map(valorNivel).filter(v => v !== null);
    if (validos.length === 0) return 0;
    return Math.round((validos.reduce((a, b) => a + b, 0) / validos.length) * 100);
}

// ── Extracción de observaciones de una evaluación ─────────────────────────

/**
 * Devuelve el texto de observaciones/incidencias de una evaluación.
 * Prioriza campos más específicos y no repite el mismo texto.
 */
function extraerObservacion(ev) {
    const candidatos = [
        ev.recuperacion?.observacionesRecuperacion,
        ev.renovacion?.observacionesRenovacion,
        ev.cobranza?.observacionesCobranza,
        ev.desembolsoCredito?.observacionesDesembolso,
        ev.cierreCiclo?.incidenciasCierre,
        ev.cierreCiclo?.incidencias,
    ];

    const vistos = new Set();
    const resultado = [];

    for (const txt of candidatos) {
        if (txt && txt.trim() && !vistos.has(txt.trim())) {
            vistos.add(txt.trim());
            resultado.push(txt.trim());
        }
    }

    return resultado.join(' | ');
}

// ── Conteo de parámetros ───────────────────────────────────────────────────

function contarParametros(evaluaciones, proceso) {
    const definiciones = {
        'Recuperación': {
            campos: [
                { key: 'puntualidadAsesor',      label: 'Puntualidad del asesor' },
                { key: 'asistenciaGrupo',         label: 'Asistencia del grupo' },
                { key: 'recuperacionPactado',     label: 'Recuperación pactado' },
                { key: 'fichaCerrada',            label: 'Ficha cerrada' },
                { key: 'registroHojaControl',     label: 'Registro hoja de control' },
                { key: 'cotejoHojaControl',       label: 'Cotejo hoja de control' },
                { key: 'recibos',                 label: 'Recibos' }
            ],
            seccion: 'recuperacion',
            niveles: ['Ideal', 'Alerta', 'Riesgo']
        },
        'Renovación': {
            campos: [
                { key: 'documentacionSemana',  label: 'Documentación semana' },
                { key: 'asesoriaCliente',      label: 'Asesoría al cliente' },
                { key: 'expedientesCompletos', label: 'Expedientes completos' },
                { key: 'valoracionRiesgo',     label: 'Valoración de riesgo' }
            ],
            seccion: 'renovacion',
            niveles: ['Ideal', 'Alerta', 'Riesgo']
        },
        'Cobranza': {
            campos: [
                { key: 'diasAtraso',      label: 'Días de atraso' },
                { key: 'estrategiasASEC', label: 'Estrategias ASEC', altKey: 'estrategiasAsec' },
                { key: 'acciones',        label: 'Acciones' },
                { key: 'saldoVencido',    label: 'Saldo vencido' }
            ],
            seccion: 'cobranza',
            niveles: ['Ideal', 'Alerta', 'Riesgo']
        },
        'Desembolso': {
            campos: [
                { key: 'dinamicaPresentacion',    label: 'Dinámica y presentación' },
                { key: 'educacionFinanciera',     label: 'Educación financiera' },
                { key: 'devolucionGarantias',     label: 'Devolución de garantías' },
                { key: 'comentariosReglamento',   label: 'Comentarios del reglamento' },
                { key: 'comentariosContrato',     label: 'Comentarios del contrato' },
                { key: 'pagoSancionesSolidarios', label: 'Pago de sanciones solidarios' }
            ],
            seccion: 'desembolsoCredito.actividadesPrevias',
            niveles: ['Totalmente', 'Parcial y/o apresurada', 'No']
        }
    };

    const def = definiciones[proceso];
    if (!def) return { campos: [], niveles: [] };

    const evsFiltradas = evaluaciones.filter(e => e.datosGenerales?.procesoEvaluado === proceso);
    const conteo = {};

    for (const campo of def.campos) {
        conteo[campo.key] = { label: campo.label };
        for (const nivel of def.niveles) conteo[campo.key][nivel] = 0;
    }

    for (const ev of evsFiltradas) {
        let seccion;
        if (def.seccion.includes('.')) {
            const parts = def.seccion.split('.');
            seccion = ev[parts[0]]?.[parts[1]] || {};
        } else {
            seccion = ev[def.seccion] || {};
        }

        for (const campo of def.campos) {
            const val = seccion[campo.key] || (campo.altKey ? seccion[campo.altKey] : undefined);
            if (val && conteo[campo.key][val] !== undefined) {
                conteo[campo.key][val]++;
            }
        }
    }

    return { campos: Object.values(conteo), niveles: def.niveles };
}

// ── Escape HTML ────────────────────────────────────────────────────────────

function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── Endpoint principal ─────────────────────────────────────────────────────

const generarReporte = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, tipoAuditoria } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                message: 'Se requieren los parámetros fechaInicio y fechaFin (YYYY-MM-DD).'
            });
        }

        const inicio = new Date(`${fechaInicio}T00:00:00.000Z`);
        const fin    = new Date(`${fechaFin}T23:59:59.999Z`);

        if (isNaN(inicio) || isNaN(fin)) {
            return res.status(400).json({ success: false, message: 'Fechas inválidas.' });
        }

        const filtro = { 'datosGenerales.fechaEvaluacion': { $gte: inicio, $lte: fin } };
        if (tipoAuditoria) filtro.tipoAuditoria = tipoAuditoria;

        const evaluaciones = await Evaluation.find(filtro).select('-evidenciaFotos').lean();

        if (evaluaciones.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontraron evaluaciones en el periodo indicado.' });
        }

        // ── Separar evaluaciones: ASEC vs Ejecutivos/COP ─────────────────
        const esEjecutivo = ev =>
            ev.tipoAuditoria === 'Ejecutiva' ||
            ['Procesos de Ejecutivas', 'Ejecutiva'].includes(ev.datosGenerales?.procesoEvaluado);

        const evsASEC = evaluaciones.filter(ev => !esEjecutivo(ev));
        const evsCOP  = evaluaciones.filter(ev => esEjecutivo(ev));

        // ── 1. Métricas globales ──────────────────────────────────────────
        const asecSet          = new Set();
        const coordSet         = new Set();
        const gruposSet        = new Set();
        const procesosConteo   = {};
        const coordAsecConteo  = {};  // coordinacion -> set de ASECs

        for (const ev of evsASEC) {
            const dg = ev.datosGenerales || {};
            if (dg.asesorEvaluadoNombre) {
                asecSet.add(dg.asesorEvaluadoNombre);
                const coord = dg.coordinacionNombre || 'Sin coordinación';
                if (!coordAsecConteo[coord]) coordAsecConteo[coord] = new Set();
                coordAsecConteo[coord].add(dg.asesorEvaluadoNombre);
            }
            if (dg.coordinacionNombre) coordSet.add(dg.coordinacionNombre);

            const grp = dg.grupo?.nombre || dg.clienteIndividual?.nombre || '';
            if (grp) gruposSet.add(grp);

            const proc = dg.procesoEvaluado || 'Otro';
            procesosConteo[proc] = (procesosConteo[proc] || 0) + 1;
        }

        const totalAsec           = asecSet.size;
        const totalCoordinaciones = coordSet.size;
        const totalGrupos         = gruposSet.size;
        const totalEvaluaciones   = evaluaciones.length;

        // ── 2. Resultados por ASEC con detalle por grupo ──────────────────
        const porAsesor = {};

        for (const ev of evsASEC) {
            const nombre = ev.datosGenerales?.asesorEvaluadoNombre || 'Sin nombre';
            const coord  = ev.datosGenerales?.coordinacionNombre   || '';
            const pct    = calcularPorcentaje(ev);
            const grupo  = ev.datosGenerales?.grupo?.nombre || ev.datosGenerales?.clienteIndividual?.nombre || '';
            const obs    = extraerObservacion(ev);
            const proc   = ev.datosGenerales?.procesoEvaluado || '';

            if (!porAsesor[nombre]) {
                porAsesor[nombre] = { nombre, coord, pcts: [], grupos: [] };
            }
            porAsesor[nombre].pcts.push(pct);
            porAsesor[nombre].grupos.push({ nombre: grupo, obs, proceso: proc, pct });
        }

        const asecResultados = Object.values(porAsesor).map(a => {
            const promedio = Math.round(a.pcts.reduce((s, v) => s + v, 0) / a.pcts.length);
            return {
                nombre: a.nombre,
                coord: a.coord,
                totalEvaluaciones: a.pcts.length,
                promedio,
                nivel: nivelTexto(promedio),
                badgeClase: nivelClase(promedio),
                barClase: barClase(promedio),
                color: nivelColor(promedio),
                cumpleMeta: promedio >= META,
                grupos: a.grupos  // detalle por grupo
            };
        }).sort((a, b) => b.promedio - a.promedio);

        const asecCumplen     = asecResultados.filter(a => a.cumpleMeta).length;
        const asecNoCumplen   = totalAsec - asecCumplen;
        const pctCumplimiento = totalAsec > 0 ? Math.round((asecCumplen / totalAsec) * 100) : 0;

        // ── 3. Resumen de coordinaciones ──────────────────────────────────
        // "De corazón (3 ASEC), Lealtad (2 ASEC) ..."
        const coordResumenTexto = Object.entries(coordAsecConteo)
            .sort((a, b) => b[1].size - a[1].size)
            .map(([coord, set]) => `${escapeHtml(coord)} (${set.size} ASEC)`)
            .join(', ');

        // ── 4. Procesos y distribución ────────────────────────────────────
        const procesosEvaluados = Object.entries(procesosConteo).map(([proc, count]) => ({
            nombre: proc,
            grupos: count,
            evaluaciones: count,
            participacion: Math.round((count / totalEvaluaciones) * 100)
        }));

        // Texto narrativo de procesos
        const procesosTexto = procesosEvaluados
            .map(p => `${escapeHtml(p.nombre)} (${p.grupos} grupo${p.grupos !== 1 ? 's' : ''})`)
            .join(', ');

        // ── 5. Parámetros por proceso ─────────────────────────────────────
        const procesosConParametros = Object.keys(procesosConteo).map(proc => ({
            nombre: proc,
            totalEvaluaciones: procesosConteo[proc],
            ...contarParametros(evsASEC, proc)
        }));

        // ── 6. COP / Ejecutivos ───────────────────────────────────────────
        const porCOP = {};
        for (const ev of evsCOP) {
            const nombre = ev.datosGenerales?.asesorEvaluadoNombre || 'Sin nombre';
            const coord  = ev.datosGenerales?.coordinacionNombre   || '';
            const proc   = ev.datosGenerales?.procesoEvaluado      || '';
            const grupo  = ev.datosGenerales?.grupo?.nombre || ev.datosGenerales?.clienteIndividual?.nombre || '';
            const obs    = extraerObservacion(ev);

            if (!porCOP[nombre]) porCOP[nombre] = { nombre, coord, proceso: proc, grupos: [] };
            porCOP[nombre].grupos.push({ nombre: grupo, obs, proceso: proc });
        }

        // ── 7. Auto-conclusiones ──────────────────────────────────────────
        const asecRiesgo = asecResultados.filter(a => a.promedio < 60);
        const asecAlerta = asecResultados.filter(a => a.promedio >= 60 && a.promedio < 80);

        const parametrosEnRiesgo = [];
        for (const proc of procesosConParametros) {
            if (!proc.campos) continue;
            const nivelR = proc.niveles?.find(n => n.toLowerCase().includes('riesgo') || n === 'No');
            if (!nivelR) continue;
            for (const campo of proc.campos) {
                if ((campo[nivelR] || 0) >= 2) {
                    parametrosEnRiesgo.push(`${campo.label} (${proc.nombre})`);
                }
            }
        }

        // ── 8. HTML de cada sección ───────────────────────────────────────
        const fechaGeneracion = formatDateShort(new Date());
        const periodoLargo    = `${formatDateES(inicio)} al ${formatDateES(fin)}`;
        const periodoCorto    = `${formatDateShort(inicio)} - ${formatDateShort(fin)}`;
        const tipoLabel       = tipoAuditoria || 'Auditoría Operativa';

        // SVG dona
        const svgDona = generarDonaFull(pctCumplimiento);

        // Tabla resumen ASEC (página 1)
        const filasAsec = asecResultados.map(a => `
            <tr>
                <td><strong>${escapeHtml(a.nombre.toUpperCase())}</strong></td>
                <td>${escapeHtml(a.coord.toUpperCase())}</td>
                <td class="text-center">${a.totalEvaluaciones}</td>
                <td class="text-center" style="font-weight:700;color:${a.color};">${a.promedio}%</td>
                <td class="text-center"><span class="badge ${a.badgeClase}">${a.nivel}</span></td>
                <td class="text-center">
                    <span class="badge ${a.cumpleMeta ? 'badge-success' : 'badge-danger'}">
                        ${a.cumpleMeta ? 'SI' : 'NO'}
                    </span>
                </td>
            </tr>`).join('');

        // Barras de desempeño
        const barrasDesempeno = asecResultados.map(a => `
            <div class="perf-row">
                <div class="perf-name">${escapeHtml(a.nombre)}</div>
                <div class="perf-track">
                    <div class="perf-bar ${a.barClase}" style="width:${a.promedio}%;"></div>
                </div>
                <div class="perf-val" style="color:${a.color};">${a.promedio}%</div>
            </div>`).join('');

        // Tarjetas de proceso
        const coloresProc = ['#1d4ed8', '#7c3aed', '#0891b2', '#059669', '#b45309'];
        const tarjetasProcesos = procesosEvaluados.map((p, i) => `
            <div class="proc-card" style="border-left-color:${coloresProc[i % coloresProc.length]};">
                <div class="proc-name">${escapeHtml(p.nombre)}</div>
                <div class="proc-num" style="color:${coloresProc[i % coloresProc.length]};">${p.grupos}</div>
                <div class="proc-sub">grupo${p.grupos !== 1 ? 's' : ''} evaluado${p.grupos !== 1 ? 's' : ''}</div>
            </div>`).join('');

        // Filas distribución
        const filasProcesos = procesosEvaluados.map(p => `
            <tr>
                <td><strong>${escapeHtml(p.nombre)}</strong></td>
                <td class="text-center">${p.grupos}</td>
                <td class="text-center">${p.evaluaciones}</td>
                <td class="text-center">${p.participacion}%</td>
            </tr>`).join('');

        // Bloques de parámetros con celdas coloreadas
        const bloquesParametros = procesosConParametros.map(proc => {
            if (!proc.campos || proc.campos.length === 0) return '';
            const encabezados = proc.niveles.map((n, i) => {
                const colors = ['#16a34a', '#b45309', '#dc2626'];
                return `<th class="text-center" style="background:${colors[i] || '#334155'};">${escapeHtml(n)}</th>`;
            }).join('');
            const filas = proc.campos.map(campo => {
                const v0 = campo[proc.niveles[0]] ?? 0;
                const v1 = campo[proc.niveles[1]] ?? 0;
                const v2 = campo[proc.niveles[2]] ?? 0;
                return `<tr>
                    <td>${escapeHtml(campo.label)}</td>
                    <td class="text-center cell-ideal">${v0}</td>
                    <td class="text-center cell-alerta">${v1}</td>
                    <td class="text-center cell-riesgo">${v2}</td>
                </tr>`;
            }).join('');
            return `
            <div class="param-block">
                <div class="param-header">
                    <h3>${escapeHtml(proc.nombre)}</h3>
                    <span>${proc.totalEvaluaciones} evaluaciones</span>
                </div>
                <table>
                    <thead><tr><th>Parámetro</th>${encabezados}</tr></thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>`;
        }).join('');

        // ── BLOQUES DE INCIDENCIAS con detalle por grupo ──────────────────
        const bloquesIncidencias = asecResultados.map(a => {
            const badgeMeta = a.cumpleMeta
                ? `<span class="badge badge-success">Meta: SI</span>`
                : `<span class="badge badge-danger">Meta: NO</span>`;

            // Grupos con observaciones
            const gruposConObs = a.grupos.filter(g => g.obs && g.obs.trim());
            const gruposSinObs = a.grupos.filter(g => !g.obs || !g.obs.trim());

            let contenido = '';

            if (gruposConObs.length > 0) {
                contenido += gruposConObs.map(g => `
                    <div class="grupo-inc-item">
                        ${g.nombre ? `<div class="grupo-inc-nombre">
                            <span class="grupo-tag">G.</span> ${escapeHtml(g.nombre)}
                            ${g.proceso ? `<span class="proceso-tag">${escapeHtml(g.proceso)}</span>` : ''}
                        </div>` : ''}
                        <div class="grupo-inc-obs">${escapeHtml(g.obs)}</div>
                    </div>`).join('');
            }

            if (gruposSinObs.length > 0 && gruposConObs.length === 0) {
                contenido = `<div class="no-incidents">No se identificaron incidencias relevantes durante el periodo evaluado.</div>`;
            } else if (gruposSinObs.length > 0) {
                const nombresLimpios = gruposSinObs
                    .filter(g => g.nombre)
                    .map(g => escapeHtml(g.nombre))
                    .join(', ');
                if (nombresLimpios) {
                    contenido += `<div class="grupos-sin-obs">Sin incidencias: ${nombresLimpios}</div>`;
                }
            }

            if (!contenido) {
                contenido = `<div class="no-incidents">No se identificaron incidencias relevantes durante el periodo evaluado.</div>`;
            }

            return `
            <div class="advisor-block">
                <div class="advisor-header">
                    <div>
                        <div class="advisor-name">${escapeHtml(a.nombre.toUpperCase())}</div>
                        <div class="advisor-coord">
                            <strong>COORD</strong> ${escapeHtml(a.coord || 'N/A')} &nbsp;·&nbsp;
                            ${a.totalEvaluaciones} evaluación${a.totalEvaluaciones !== 1 ? 'es' : ''}
                        </div>
                    </div>
                    <div class="advisor-score-wrap">
                        <div class="advisor-score" style="color:${a.color};">${a.promedio}%</div>
                        ${badgeMeta}
                    </div>
                </div>
                <div class="grupos-inc-list">${contenido}</div>
            </div>`;
        }).join('');

        // ── BLOQUE DE COORDINADORES/COP ───────────────────────────────────
        let bloquesCOP = '';
        const copList = Object.values(porCOP);

        if (copList.length > 0) {
            bloquesCOP = copList.map(cop => {
                const gruposHTML = cop.grupos.map(g => `
                    <div class="grupo-inc-item">
                        ${g.nombre ? `<div class="grupo-inc-nombre">
                            <span class="grupo-tag">G.</span> ${escapeHtml(g.nombre)}
                            ${g.proceso ? `<span class="proceso-tag">${escapeHtml(g.proceso)}</span>` : ''}
                        </div>` : ''}
                        ${g.obs ? `<div class="grupo-inc-obs">${escapeHtml(g.obs)}</div>` : ''}
                    </div>`).join('') || `<div class="no-incidents">Sin incidencias registradas.</div>`;

                return `
                <div class="advisor-block" style="border-left: 3px solid #7c3aed;">
                    <div class="advisor-header">
                        <div>
                            <div class="advisor-name" style="color:#7c3aed;">
                                COP ${escapeHtml(cop.nombre.toUpperCase())}
                            </div>
                            <div class="advisor-coord">
                                <strong>COORD</strong> ${escapeHtml(cop.coord || 'N/A')} &nbsp;·&nbsp;
                                Proceso: ${escapeHtml(cop.proceso || 'N/A')}
                            </div>
                        </div>
                        <span class="badge badge-info">Coordinador</span>
                    </div>
                    <div class="grupos-inc-list">${gruposHTML}</div>
                </div>`;
            }).join('');
        }

        // ── Hallazgos para conclusiones ───────────────────────────────────
        let textoHallazgos = '';
        if (parametrosEnRiesgo.length > 0) {
            textoHallazgos += parametrosEnRiesgo.slice(0, 5)
                .map(p => `<li>${escapeHtml(p)} presentó frecuencia de riesgo durante el periodo.</li>`).join('');
        } else {
            textoHallazgos += '<li>No se identificaron parámetros con alta frecuencia de riesgo.</li>';
        }
        asecAlerta.forEach(a => {
            textoHallazgos += `<li>${escapeHtml(a.nombre)} se encuentra en nivel de alerta con ${a.promedio}% de cumplimiento.</li>`;
        });
        asecRiesgo.forEach(a => {
            textoHallazgos += `<li>${escapeHtml(a.nombre)} presenta nivel de riesgo con ${a.promedio}%, requiriendo atención prioritaria.</li>`;
        });

        // ── Tabla resumen final ───────────────────────────────────────────
        const filasResumenFinal = `
            <tr><td>ASEC evaluados</td><td class="text-right"><strong>${totalAsec}</strong></td></tr>
            <tr><td>Coordinaciones evaluadas</td><td class="text-right"><strong>${totalCoordinaciones}</strong></td></tr>
            <tr><td>Grupos evaluados</td><td class="text-right"><strong>${totalGrupos}</strong></td></tr>
            <tr><td>Evaluaciones realizadas</td><td class="text-right"><strong>${totalEvaluaciones}</strong></td></tr>
            <tr><td>ASEC que cumplen la meta</td><td class="text-right"><strong>${asecCumplen}</strong></td></tr>
            <tr><td>ASEC que no cumplen la meta</td><td class="text-right"><strong>${asecNoCumplen}</strong></td></tr>
            ${copList.length > 0 ? `<tr><td>Coordinadores auditados</td><td class="text-right"><strong>${copList.length}</strong></td></tr>` : ''}
        `;

        // ── Leer template y reemplazar placeholders ───────────────────────
        const templatePath = path.join(__dirname, '../templates/reporte_acc_template.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        const reemplazos = {
            PERIODO_LARGO:            periodoLargo,
            PERIODO_CORTO:            periodoCorto,
            FECHA_GENERACION:         fechaGeneracion,
            TIPO_AUDITORIA:           tipoLabel,
            TOTAL_ASEC:               totalAsec,
            TOTAL_COORDINACIONES:     totalCoordinaciones,
            TOTAL_GRUPOS:             totalGrupos,
            TOTAL_EVALUACIONES:       totalEvaluaciones,
            ASEC_CUMPLEN:             asecCumplen,
            ASEC_TOTAL:               totalAsec,
            PCT_CUMPLIMIENTO:         pctCumplimiento,
            META:                     META,
            SVG_DONA:                 svgDona,
            COORD_RESUMEN:            coordResumenTexto,
            PROCESOS_TEXTO:           procesosTexto,
            COP_COUNT:                copList.length,
            FILAS_ASEC:               filasAsec,
            BARRAS_DESEMPENO:         barrasDesempeno,
            TARJETAS_PROCESOS:        tarjetasProcesos,
            FILAS_PROCESOS:           filasProcesos,
            BLOQUES_PARAMETROS:       bloquesParametros,
            BLOQUES_INCIDENCIAS:      bloquesIncidencias,
            BLOQUES_COP:              bloquesCOP,
            TEXTO_HALLAZGOS:          textoHallazgos,
            FILAS_RESUMEN_FINAL:      filasResumenFinal,
            CONCL_TOTAL_EVALUACIONES: totalEvaluaciones,
            CONCL_TOTAL_GRUPOS:       totalGrupos,
            CONCL_TOTAL_ASEC:         totalAsec,
            CONCL_ASEC_CUMPLEN:       asecCumplen,
            CONCL_ASEC_NO_CUMPLEN:    asecNoCumplen
        };

        for (const [key, value] of Object.entries(reemplazos)) {
            html = html.replaceAll(`{{${key}}}`, value);
        }

        // Manejar bloque condicional de COP
        if (copList.length > 0) {
            html = html.replace(/\{\{#if_cop\}\}/g, '').replace(/\{\{\/if_cop\}\}/g, '');
        } else {
            // Eliminar el bloque completo si no hay COPs
            html = html.replace(/\{\{#if_cop\}\}[\s\S]*?\{\{\/if_cop\}\}/g, '');
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="reporte_${fechaInicio}_${fechaFin}.html"`);
        res.send(html);

    } catch (error) {
        console.error('Error al generar reporte:', error);
        res.status(500).json({ success: false, message: 'Error al generar el reporte', error: error.message });
    }
};

module.exports = { generarReporte };
