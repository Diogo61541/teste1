import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

const defaultTemplate = `-DIAGNÓSTICO: HEMATÚRIA VESICAL
-COMORBIDADES: NEGA
-ALERGIAS: NEGA

- Paciente em box 02 do PS adulto, com presença de acompanhante, consciente, orientado, fásico comunicativo, abertura ocular espontânea, contactua aos estímulos verbais, respirando sem auxílio de O², em AA e sem sinais de desconforto respiratório. Ao exame: anictérico, acianótico, normocorado, afebril, normocárdico, normotenso, tórax sem abaulamentos, abdômen globoso. Segue em dieta VO, com boa aceitação da dieta e sem intercorrências. AVP em MSE pérvio e sem sinais flogísticos. Eliminações vesicais-intestinais espontâneas e sem alterações.

Paciente deu entrada em PS adulto

Escala de BRADEN: Sem risco (20); Escala de MORSE: Alto Risco (45), Escala de dor EVA: Leve (2)

Gerenciamento de riscos:
`

const sampleSource = `04/04/2026. Paciente João da Silva, 67 anos, leito 12.
Diagnóstico: pneumonia comunitária com insuficiência respiratória.
Refere melhora da dispneia e tosse seca. Afebril.
SV: PA 120x70, FC 88, FR 19, SatO2 95% em 2L.
Pulmão com crepitações bibasais leves. Bulhas rítmicas sem sopros.
Abdome flácido, indolor. Extremidades sem edema.
Manter antibioticoterapia, desmame gradual de O2, fisioterapia respiratória e reavaliar exames amanhã.`

const defaultForms = [
  {
    id: 'atestado',
    title: 'Atestado médico simples',
    content: `Atesto para os devidos fins que {{paciente}}, {{idade}} anos, esteve em avaliação médica nesta data ({{data}}).
Necessita afastamento de suas atividades por ______ dias.

CID/Diagnóstico: {{diagnostico}}
Assinatura e carimbo:
`,
  },
  {
    id: 'solicitacao-exame',
    title: 'Solicitação de exames',
    content: `Solicito exames complementares para {{paciente}}, leito {{leito}}, devido a {{diagnostico}}.

Exames solicitados:
-
-

Data: {{data}}
Assinatura e carimbo:
`,
  },
]

const FIXED_PIX_KEY = '0db1890a-9772-48de-a725-02641404f59d'

const FIELD_PATTERNS = {
  data: [/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/, /\b(\d{1,2}-\d{1,2}-\d{2,4})\b/],
  paciente: [/paciente\s*:?\s*([A-ZÀ-ÿ][A-Za-zÀ-ÿ'\s]+?)(?:,|\.|\s+\d+\s*anos|$)/i],
  idade: [/\b(\d{1,3})\s*anos?\b/i],
  leito: [/\bleito\s*:?\s*([A-Za-z0-9-]+)/i],
  diagnostico: [/diagn[oó]stico(?:\s+principal)?\s*:?\s*([^\.\n]+)/i],
  subjetivo: [/(refere[^\n\.]*[\n\.]?[^\n]*)/i],
  estado_geral: [/(bom estado geral|regular estado geral|estado geral preservado|hipocorado|desidratado|acian[oó]tico|anict[eé]rico)/i],
  sinais_vitais: [/(PA\s*[^\n\.]*?SatO2\s*[^\n\.]*)/i, /(SV\s*:?\s*[^\n]+)/i],
  pulmoes: [/(pulm[aã]o(?:es)?[^\n\.]*|crepita[cç][oõ]es[^\n\.]*)/i],
  cardiovascular: [/(bulhas[^\n\.]*|cardiovascular[^\n\.]*)/i],
  abdome: [/(abdome[^\n\.]*)/i],
  extremidades: [/(extremidades[^\n\.]*)/i],
  conduta: [/(conduta\s*:?\s*[^\n]+)$/im, /(manter[^\n]+)$/im],
}

const LABEL_TO_FIELD = {
  data: 'data',
  paciente: 'paciente',
  idade: 'idade',
  leito: 'leito',
  diagnostico: 'diagnostico',
  'diagnostico principal': 'diagnostico',
  subjetivo: 'subjetivo',
  'estado geral': 'estado_geral',
  'sinais vitais': 'sinais_vitais',
  pulmoes: 'pulmoes',
  cardiovascular: 'cardiovascular',
  abdome: 'abdome',
  extremidades: 'extremidades',
  conduta: 'conduta',
}

const CONTRADICTION_RULES = [
  { ifSource: ['febril', 'febre'], from: /\bafebril\b/gi, to: 'febril' },
  { ifSource: ['afebril'], from: /\bfebril\b/gi, to: 'afebril' },
  { ifSource: ['dispneico', 'dispneica', 'dispneia importante', 'dispneia persistente', 'piora da dispneia'], from: /\beupneic[oa]\b/gi, to: 'dispneico' },
  { ifSource: ['eupneico', 'sem dispneia'], from: /\bdispneic[oa]\b/gi, to: 'eupneico' },
  { ifSource: ['edema'], from: /\bsem edema\b/gi, to: 'com edema' },
  { ifSource: ['sem edema'], from: /\bcom edema\b/gi, to: 'sem edema' },
]

const CLINICAL_TRANSFORM_RULES = [
  {
    ifSource: ['oxigenio', 'o2', 'cateter nasal', 'mascara'],
    from: /respirando sem auxílio de O²/i,
    to: 'respirando com auxílio de O²',
  },
  {
    ifSource: ['sem oxigenio', 'ar ambiente', 'aa'],
    from: /respirando com auxílio de O²/i,
    to: 'respirando sem auxílio de O²',
  },
  {
    ifSource: [
      'desconforto respiratorio',
      'taquipneia',
      'uso de musculatura acessoria',
      'tiragem',
      'esforco respiratorio',
      'dispneia importante',
      'dispneia persistente',
      'piora da dispneia',
      'dispneico',
      'dispneica',
      'falta de ar importante',
    ],
    from: /sem sinais de desconforto respiratório/i,
    to: 'com sinais de desconforto respiratório',
  },
  {
    ifSource: ['sem desconforto respiratorio', 'eupneico', 'sem dispneia'],
    from: /com sinais de desconforto respiratório/i,
    to: 'sem sinais de desconforto respiratório',
  },
  {
    ifSource: ['hipocorado', 'palidez', 'anemia'],
    from: /normocorado/i,
    to: 'hipocorado',
  },
  {
    ifSource: ['normocorado'],
    from: /hipocorado/i,
    to: 'normocorado',
  },
  {
    ifSource: ['taquicardico', 'fc elevada', 'taquicardia'],
    from: /normocárdico/i,
    to: 'taquicárdico',
  },
  {
    ifSource: ['bradicardico', 'fc baixa', 'bradicardia'],
    from: /normocárdico/i,
    to: 'bradicárdico',
  },
  {
    ifSource: ['hipertenso', 'pa elevada'],
    from: /normotenso/i,
    to: 'hipertenso',
  },
  {
    ifSource: ['hipotenso', 'pa baixa'],
    from: /normotenso/i,
    to: 'hipotenso',
  },
  {
    ifSource: ['abdome flacido', 'abdome flácido'],
    from: /abdômen globoso/i,
    to: 'abdômen flácido',
  },
  {
    ifSource: ['abdome globoso', 'distendido'],
    from: /abdômen flácido/i,
    to: 'abdômen globoso',
  },
  {
    ifSource: ['dieta zero', 'jejum', 'npo'],
    from: /Segue em dieta VO, com boa aceitação da dieta e sem intercorrências\./i,
    to: 'Segue em dieta zero, em jejum, sem intercorrências.',
  },
  {
    ifSource: ['boa aceitação', 'boa aceitacao', 'dieta vo'],
    from: /Segue em dieta zero, em jejum, sem intercorrências\./i,
    to: 'Segue em dieta VO, com boa aceitação da dieta e sem intercorrências.',
  },
  {
    ifSource: ['aceitacao parcial', 'aceitação parcial'],
    from: /Segue em dieta VO, com boa aceitação da dieta e sem intercorrências\./i,
    to: 'Segue em dieta VO, com aceitação parcial da dieta.',
  },
  {
    ifSource: ['avp msd', 'avp em MSD', 'acesso venoso'],
    from: /AVP em MSE pérvio e sem sinais flogísticos\./i,
    to: 'AVP em MSD pérvio e sem sinais flogísticos.',
  },
  {
    ifSource: ['avp mse', 'avp em mse'],
    from: /AVP em MSE pérvio e sem sinais flogísticos\./i,
    to: 'AVP em MSE pérvio e sem sinais flogísticos.',
  },
  {
    ifSource: ['sinais flogisticos', 'sinais flogísticos', 'flebite', 'infiltracao', 'infiltração'],
    from: /sem sinais flogísticos/i,
    to: 'com sinais flogísticos',
  },
  {
    ifSource: ['sem sinais flogisticos', 'sem sinais flogísticos'],
    from: /com sinais flogísticos/i,
    to: 'sem sinais flogísticos',
  },
  {
    ifSource: ['eliminacao vesical', 'retenção urinária', 'disúria', 'hematúria', 'hematuria'],
    from: /Eliminações vesicais-intestinais espontâneas e sem alterações\./i,
    to: 'Eliminações vesicais com alterações conforme evolução clínica.',
  },
  {
    ifSource: ['sem alteracoes', 'sem alterações'],
    from: /Eliminações vesicais com alterações conforme evolução clínica\./i,
    to: 'Eliminações vesicais-intestinais espontâneas e sem alterações.',
  },
  {
    ifSource: ['consciente', 'orientado', 'contactua', 'fásico comunicativo'],
    from: /consciente, orientado, fásico comunicativo, abertura ocular espontânea, contactua aos estímulos verbais/i,
    to: 'consciente, orientado, fásico comunicativo, abertura ocular espontânea, contactua aos estímulos verbais',
  },
  {
    ifSource: ['rebaixado', 'sonolento', 'confuso', 'desorientado'],
    from: /consciente, orientado, fásico comunicativo, abertura ocular espontânea, contactua aos estímulos verbais/i,
    to: 'rebaixado do nível de consciência, com alteração do contato verbal',
  },
  {
    ifSource: ['SVD', 'sonda vesical', 'diurese por sonda'],
    from: /Eliminações vesicais-intestinais espontâneas e sem alterações/i,
    to: 'Eliminações vesicais por SVD, com volume e características a monitorar conforme evolução clínica, eliminações intestinais espontâneas e sem alterações.',
  },
]

const KEY_LINE_RULES = [
  { key: 'diagnostico', labels: ['diagnóstico', 'diagnostico'], templateLabel: 'DIAGNÓSTICO' },
  { key: 'comorbidades', labels: ['comorbidades', 'comorbidade', 'hpp', 'historia pregressa', 'história pregressa'], templateLabel: 'COMORBIDADES' },
  { key: 'alergias', labels: ['alergias'], templateLabel: 'ALERGIAS' },
]

const DEFAULT_RESPIRATORY_LINE = '- Paciente em box 02 do PS adulto, com presença de acompanhante, consciente, orientado, fásico comunicativo, abertura ocular espontânea, contactua aos estímulos verbais, respirando sem auxílio de O², em AA e sem sinais de desconforto respiratório. Ao exame: anictérico, acianótico, normocorado, afebril, normocárdico, normotenso, tórax sem abaulamentos, abdômen globoso. Segue em dieta VO, com boa aceitação da dieta e sem intercorrências. AVP em MSE pérvio e sem sinais flogísticos. Eliminações vesicais-intestinais espontâneas e sem alterações.'

const ENTRY_LINE_TEXT = 'Paciente deu entrada em PS adulto'

const EXAM_PATTERNS = [
  /\b(exame|exames|hemograma|leuco|hb|hct|plaqueta|cr|creatinina|ureia|pcr|procalcitonina|lactato|gasometria|rx|raio\s*x|tomografia|tc\b|ressonancia|rm\b|usg|ultrassom|ecg|ecocardiograma)\b/i,
]

const OPINION_PATTERNS = [
  /\b(parecer|interconsulta|avaliado por|avaliada por|discutido com|opiniao de|neurologia|cardiologia|infectologia|nefrologia|pneumologia|cirurgia|uti)\b/i,
]

const PLAN_PATTERNS = [
  /\b(solicitad[oa]|coletad[oa]|aguardando|programad[oa]|manter|suspender|iniciar|ajustar)\b/i,
]

function containsAny(text, terms) {
  return terms.some((term) => text.includes(normalizeText(term)))
}

function splitSentences(text) {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.;!?])\s+/))
    .map((item) => item.trim())
    .filter(Boolean)
}

function findSentenceByContext(source, positiveTerms, negativeTerms = []) {
  const sentences = splitSentences(source)

  for (const sentence of sentences) {
    const normalizedSentence = normalizeText(sentence)
    const hasPositive = positiveTerms.some((term) => normalizedSentence.includes(normalizeText(term)))
    const hasNegative = negativeTerms.some((term) => normalizedSentence.includes(normalizeText(term)))

    if (hasPositive && !hasNegative) return sentence
  }

  return ''
}

function sentenceHasContext(sentence, positiveTerms, negativeTerms = []) {
  const normalizedSentence = normalizeText(sentence)
  const hasPositive = positiveTerms.some((term) => normalizedSentence.includes(normalizeText(term)))
  const hasNegative = negativeTerms.some((term) => normalizedSentence.includes(normalizeText(term)))
  return hasPositive && !hasNegative
}

function hasPositiveDyspneaContext(sentence) {
  const normalizedSentence = normalizeText(sentence)
  const improvementOrNegation = [
    'melhora da dispneia',
    'melhora de dispneia',
    'dispneia em melhora',
    'melhora respiratoria',
    'melhora respiratória',
    'em relacao a admissao',
    'em relação à admissão',
    'sem dispneia',
    'nega dispneia',
    'eupneico',
    'eupneica',
    'sem desconforto respiratorio',
    'sem desconforto respiratório',
  ]

  if ((normalizedSentence.includes('melhora') && normalizedSentence.includes('dispne')) || normalizedSentence.includes('em relacao a admissao')) {
    return false
  }

  if (improvementOrNegation.some((term) => normalizedSentence.includes(normalizeText(term)))) {
    return false
  }

  const strongPositiveTerms = [
    'desconforto respiratorio',
    'desconforto respiratório',
    'taquipneia',
    'taquipneico',
    'taquipneica',
    'uso de musculatura acessoria',
    'uso de musculatura acessória',
    'tiragem',
    'cianose',
    'esforco respiratorio',
    'esforço respiratório',
    'dispneia importante',
    'dispneia persistente',
    'dispneia aos esforços',
    'piora da dispneia',
    'dispneico',
    'dispneica',
    'falta de ar importante',
    'falta de ar aos esforços',
  ]

  if (strongPositiveTerms.some((term) => normalizedSentence.includes(normalizeText(term)))) {
    return true
  }

  return false
}

function hasDyspneaImprovementContext(source) {
  return splitSentences(source).some((sentence) => {
    const normalizedSentence = normalizeText(sentence)
    return (normalizedSentence.includes('melhora') && normalizedSentence.includes('dispne')) || normalizedSentence.includes('em relacao a admissao')
  })
}

function extractPatientRefereParagraph(source) {
  const paragraphs = source
    .split(/\n\s*\n/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  for (const paragraph of paragraphs) {
    const normalizedParagraph = normalizeText(paragraph)
    if (normalizedParagraph.includes('paciente refere')) {
      return paragraph
    }
  }

  return ''
}

function toSentenceContinuation(sentence) {
  const trimmed = sentence.replace(/^[-\s]*/,'').trim()
  const withoutPatientPrefix = trimmed.replace(/^Paciente\s+/i, '')
  return withoutPatientPrefix.charAt(0).toLowerCase() + withoutPatientPrefix.slice(1)
}

function buildEntryLine(source) {
  const patientRefereParagraph = extractPatientRefereParagraph(source)

  if (!patientRefereParagraph) {
    return ENTRY_LINE_TEXT
  }

  return `${ENTRY_LINE_TEXT}, ${toSentenceContinuation(patientRefereParagraph)}`
}

function buildAwarenessClause(source) {
  const normalizedAwareness = normalizeText(source)
  const isFeminine = containsAny(normalizedAwareness, ['desorientada', 'orientada', 'afásica', 'afasica', 'fásica', 'fasica', 'inconsciente'])
  const hasNonCommunicative = containsAny(normalizedAwareness, [
    'não comunicativo',
    'nao comunicativo',
    'não comunicativa',
    'nao comunicativa',
    'pouco comunicativo',
    'pouco comunicativa',
    'sem contato verbal',
  ])
  const hasDisoriented = containsAny(normalizedAwareness, ['desorientado', 'desorientada'])

  if (containsAny(normalizedAwareness, ['inconsciente'])) {
    return isFeminine
      ? 'inconsciente, sem abertura ocular espontânea e sem contato verbal'
      : 'inconsciente, sem abertura ocular espontânea e sem contato verbal'
  }

  if (hasDisoriented) {
    return isFeminine
      ? hasNonCommunicative
        ? 'consciente, desorientada em tempo e espaço, fásica não comunicativa, abertura ocular espontânea, sem contato verbal'
        : 'consciente, desorientada em tempo e espaço, fásica comunicativa, abertura ocular espontânea, contactua aos estímulos verbais'
      : hasNonCommunicative
        ? 'consciente, desorientado em tempo e espaço, fásico não comunicativo, abertura ocular espontânea, sem contato verbal'
        : 'consciente, desorientado em tempo e espaço, fásico comunicativo, abertura ocular espontânea, contactua aos estímulos verbais'
  }

  if (hasNonCommunicative) {
    return isFeminine
      ? 'consciente, orientada, fásica não comunicativa, abertura ocular espontânea, sem contato verbal'
      : 'consciente, orientado, fásico não comunicativo, abertura ocular espontânea, sem contato verbal'
  }

  if (containsAny(normalizedAwareness, ['consciente'])) {
    return isFeminine
      ? 'consciente, orientada, fásica comunicativa, abertura ocular espontânea, contactua aos estímulos verbais'
      : 'consciente, orientado, fásico comunicativo, abertura ocular espontânea, contactua aos estímulos verbais'
  }

  const awarenessParts = []

  if (containsAny(normalizedAwareness, ['orientado', 'orientada'])) {
    awarenessParts.push(isFeminine ? 'orientada' : 'orientado')
  }

  if (containsAny(normalizedAwareness, ['afásico', 'afasico', 'afásica', 'afasica', 'sem contato verbal'])) {
    awarenessParts.push(isFeminine ? 'afásica, com alteração do contato verbal' : 'afásico, com alteração do contato verbal')
  } else if (containsAny(normalizedAwareness, ['fásico', 'fasico', 'fásica', 'fasica'])) {
    awarenessParts.push(isFeminine ? 'fásica comunicativa' : 'fásico comunicativo')
  }

  if (containsAny(normalizedAwareness, ['sem abertura ocular espontânea', 'sem abertura ocular espontanea', 'sem abertura ocular'])) {
    awarenessParts.push('sem abertura ocular espontânea')
  } else if (containsAny(normalizedAwareness, ['abertura ocular espontânea', 'abertura ocular espontanea'])) {
    awarenessParts.push('abertura ocular espontânea')
  }

  if (containsAny(normalizedAwareness, ['sem contato verbal'])) {
    awarenessParts.push('sem contato verbal')
  } else if (containsAny(normalizedAwareness, ['contactua', 'contato verbal'])) {
    awarenessParts.push('contactua aos estímulos verbais')
  }

  return awarenessParts.length
    ? awarenessParts.join(', ')
    : isFeminine
      ? 'consciente, orientada, fásica comunicativa, abertura ocular espontânea, contactua aos estímulos verbais'
      : 'consciente, orientado, fásico comunicativo, abertura ocular espontânea, contactua aos estímulos verbais'
}

  function isFeminineSource(source) {
    const normalizedSource = normalizeText(source)
    return containsAny(normalizedSource, [
      'paciente feminina',
      'sexo feminino',
      'mulher',
      'ela',
      'orientada',
      'desorientada',
      'consciente',
      'inconsciente',
      'afásica',
      'afasica',
      'fásica',
      'fasica',
      'ictérica',
      'icterica',
      'anictérica',
      'anicterica',
      'cianótica',
      'cianotica',
      'acianótica',
      'acianotica',
      'hipocorada',
      'normocorada',
      'taquicárdica',
      'taquicardica',
      'bradicárdica',
      'bradicardica',
      'normocárdica',
      'normocardica',
      'hipertensa',
      'hipotensa',
      'normotensa',
    ])
  }

  function genderedText(source, masculine, feminine) {
    return isFeminineSource(source) ? feminine : masculine
  }

function scoreBradenToLabel(score) {
  if (score >= 19) return 'Sem risco'
  if (score >= 15) return 'Risco leve'
  if (score >= 13) return 'Risco moderado'
  return 'Alto risco'
}

function scoreMorseToLabel(score) {
  if (score <= 24) return 'Baixo Risco'
  if (score <= 44) return 'Risco Moderado'
  return 'Alto Risco'
}

function scoreEvaToLabel(score) {
  if (score === 0) return 'Sem dor'
  if (score <= 3) return 'Leve'
  if (score <= 6) return 'Moderada'
  return 'Intensa'
}

function parseExistingScales(text) {
  const result = {}

  const braden = text.match(/Escala de BRADEN:\s*([^()\n]+?)\s*\((\d+)\)/i)
  if (braden) result.braden = { label: braden[1].trim(), score: Number(braden[2]) }

  const morse = text.match(/Escala de MORSE:\s*([^()\n]+?)\s*\((\d+)\)/i)
  if (morse) result.morse = { label: morse[1].trim(), score: Number(morse[2]) }

  const eva = text.match(/Escala de dor EVA:\s*([^()\n]+?)\s*\((\d+)\)/i)
  if (eva) result.eva = { label: eva[1].trim(), score: Number(eva[2]) }

  return result
}

function stripScaleLine(text) {
  return text
    .split('\n')
    .filter((line) => !/escala de braden|escala de morse|escala de dor eva/i.test(line))
    .join('\n')
}

function evaluateBraden(text, fallback) {
  const normalized = normalizeText(text)
  const components = []
  let score = 0
  let evidence = 0

  const addComponent = (name, points, reason, matched = false) => {
    components.push({ name, points, reason, matched })
    score += points
    if (matched) {
      evidence += 1
    }
  }

  if (containsAny(normalized, ['consciente', 'orientado', 'contactua', 'abertura ocular espontanea', 'comunicativo'])) {
    addComponent('Percepcao sensorial', 4, 'Texto sugere bom nivel de consciencia e interacao.', true)
  } else if (containsAny(normalized, ['sonolento', 'rebaixado', 'confuso', 'desorientado'])) {
    addComponent('Percepcao sensorial', 2, 'Texto sugere rebaixamento do nivel de consciencia.', true)
  } else {
    addComponent('Percepcao sensorial', 0, 'Sem indicacao clara de consciencia ou alerta no texto.')
  }

  if (containsAny(normalized, ['sudorese', 'incontinencia', 'umido', 'molhado'])) {
    addComponent('Umidade', 2, 'Ha sinais de umidade, sudorese ou incontinencia.', true)
  } else {
    addComponent('Umidade', 4, 'Sem sinais de umidade relevante descritos.')
  }

  if (containsAny(normalized, ['acamado', 'restrito ao leito', 'box 02', 'box 2', 'ps adulto'])) {
    addComponent('Atividade', 2, 'Contexto sugere permanencia no leito ou restricao importante.', true)
  } else if (containsAny(normalized, ['deambula', 'deambulando', 'ambulatorio', 'ambulante'])) {
    addComponent('Atividade', 4, 'Texto indica deambulacao ou mobilidade preservada.', true)
  } else {
    addComponent('Atividade', 3, 'Não há indicação objetiva de atividade reduzida ou preservada.')
  }

  if (containsAny(normalized, ['restrito', 'dependente', 'imobilidade'])) {
    addComponent('Mobilidade', 2, 'Texto sugere mobilidade reduzida ou dependencia.', true)
  } else if (containsAny(normalized, ['espontanea', 'sem alteracoes', 'sem intercorrencias'])) {
    addComponent('Mobilidade', 4, 'Movimentacao espontanea ou sem restricoes descritas.', true)
  } else {
    addComponent('Mobilidade', 3, 'Não foi possível inferir a mobilidade com clareza.')
  }

  if (containsAny(normalized, ['boa aceitacao da dieta', 'boa aceitação da dieta', 'dieta vo', 'alimentacao adequada'])) {
    addComponent('Nutrição', 4, 'Boa aceitacao alimentar descrita.', true)
  } else if (containsAny(normalized, ['jejum', 'npo', 'baixa aceitacao', 'baixa aceitação'])) {
    addComponent('Nutrição', 2, 'Restricao alimentar ou baixa aceitacao descrita.', true)
  } else {
    addComponent('Nutrição', 3, 'Sem dado conclusivo sobre ingesta ou dieta.')
  }

  if (containsAny(normalized, ['avp', 'acesso venoso', 'cateter', 'tubo', 'sonda', 'box 02'])) {
    addComponent('Friccao/cisalhamento', 2, 'Dispositivos ou contexto sugerem risco aumentado.', true)
  } else {
    addComponent('Friccao/cisalhamento', 3, 'Sem indicativo claro de risco por friccao/cisalhamento.')
  }

  if (score <= 0 && fallback) return { ...fallback, components }
  if (evidence === 0 && fallback) return { ...fallback, components }

  return { score, label: scoreBradenToLabel(score), components }
}

function evaluateMorse(text, fallback) {
  const normalized = normalizeText(text)
  const components = []
  let score = 0
  let evidence = 0

  const addComponent = (name, points, reason, matched = false) => {
    components.push({ name, points, reason, matched })
    score += points
    if (matched) {
      evidence += 1
    }
  }

  if (containsAny(normalized, ['queda', 'quedas', 'historico de queda', 'historico de quedas'])) {
    addComponent('Historico de quedas', 25, 'Foi identificado historico de queda no texto.', true)
  } else {
    addComponent('Historico de quedas', 0, 'Sem historico de quedas descrito.')
  }

  if (containsAny(normalized, ['diagnostico', 'diagostico', 'hematúria vesical', 'hematuria vesical'])) {
    addComponent('Diagnósticos secundários', 15, 'Há diagnósticos clínicos associados no texto.', true)
  } else {
    addComponent('Diagnósticos secundários', 0, 'Sem diagnóstico secundário identificado.')
  }

  if (containsAny(normalized, ['andador', 'bengala', 'muleta', 'cadeira de rodas', 'apoio para marcha'])) {
    addComponent('Auxilio para deambular', 15, 'Uso de apoio para marcha foi descrito.', true)
  } else {
    addComponent('Auxilio para deambular', 0, 'Sem necessidade de apoio para marcha descrita.')
  }

  if (containsAny(normalized, ['avp', 'acesso venoso', 'cateter venoso', 'venoso periférico', 'venoso periferico'])) {
    addComponent('Terapia endovenosa', 20, 'Acesso venoso/cateter foi identificado.', true)
  } else {
    addComponent('Terapia endovenosa', 0, 'Sem terapia endovenosa identificada.')
  }

  if (containsAny(normalized, ['marcha instavel', 'marcha instável', 'deambula com apoio', 'precisa de apoio', 'box 02', 'ps adulto'])) {
    addComponent('Marcha/transferencia', 10, 'Marcha instavel ou transferencia com risco descrita.', true)
  } else {
    addComponent('Marcha/transferencia', 0, 'Sem instabilidade de marcha/transferencia evidente.')
  }

  if (containsAny(normalized, ['confuso', 'desorientado', 'sonolento', 'rebaixado'])) {
    addComponent('Estado mental', 15, 'Estado mental com desorientacao/rebaixamento descrito.', true)
  } else {
    addComponent('Estado mental', 0, 'Estado mental sem alteracoes de risco descritas.')
  }

  if (score <= 0 && fallback) return { ...fallback, components }
  if (evidence === 0 && fallback) return { ...fallback, components }

  return { score, label: scoreMorseToLabel(score), components }
}

function evaluateEva(text, fallback) {
  const normalized = normalizeText(text)
  const components = []

  const addComponent = (name, points, reason, matched = false) => {
    components.push({ name, points, reason, matched })
  }

  if (containsAny(normalized, ['sem dor', 'nega dor', 'ausencia de dor', 'ausência de dor'])) {
    addComponent('Intensidade da dor', 0, 'Sem dor/nega dor no texto.', true)
    return { score: 0, label: scoreEvaToLabel(0), components }
  }

  if (containsAny(normalized, ['dor intensa', 'dor forte', 'dor importante'])) {
    addComponent('Intensidade da dor', 8, 'Dor intensa/forte descrita.', true)
    return { score: 8, label: scoreEvaToLabel(8), components }
  }

  if (containsAny(normalized, ['dor moderada'])) {
    addComponent('Intensidade da dor', 5, 'Dor moderada descrita.', true)
    return { score: 5, label: scoreEvaToLabel(5), components }
  }

  if (containsAny(normalized, ['dor leve', 'leve'])) {
    addComponent('Intensidade da dor', 2, 'Dor leve descrita.', true)
    return { score: 2, label: scoreEvaToLabel(2), components }
  }

  addComponent('Intensidade da dor', fallback?.score ?? 2, 'Sem descritor explícito; aplicando padrão/fallback.', false)

  if (fallback) return { ...fallback, components }
  return { score: 2, label: 'Leve', components }
}

function buildScaleLineFromText(text, sourceText = '') {
  const combinedText = `${text}\n${sourceText}`.trim()
  const analysisText = stripScaleLine(combinedText)
  const fallback = parseExistingScales(combinedText)

  const braden = evaluateBraden(analysisText, fallback.braden)
  const morse = evaluateMorse(analysisText, fallback.morse)
  const eva = evaluateEva(analysisText, fallback.eva)

  return `Escala de BRADEN: ${braden.label} (${braden.score}); Escala de MORSE: ${morse.label} (${morse.score}), Escala de dor EVA: ${eva.label} (${eva.score})`
}

function applyAutomaticScales(text, sourceText = '') {
  const scaleLine = buildScaleLineFromText(text, sourceText)
  const lines = text.split('\n')
  const scaleIndex = lines.findIndex((line) => /escala de braden|escala de morse|escala de dor eva/i.test(line))

  if (scaleIndex >= 0) {
    lines[scaleIndex] = scaleLine
    return lines.join('\n')
  }

  const managementIndex = lines.findIndex((line) => /gerenciamento de riscos/i.test(line))
  if (managementIndex >= 0) {
    lines.splice(managementIndex + 1, 0, scaleLine)
    return lines.join('\n')
  }

  return `${text.trimEnd()}\n\n${scaleLine}\n`
}

function pick(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
    if (match?.[0]) return match[0].trim()
  }
  return ''
}

function extractFields(source) {
  return Object.fromEntries(
    Object.entries(FIELD_PATTERNS).map(([key, patterns]) => [key, pick(source, patterns)]),
  )
}

function mergeTemplate(template, values) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => values[key] || `{{${key}}}`)
}

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function mapLabelToField(label) {
  const normalized = normalizeText(label).replace(/\s+/g, ' ').trim()
  return LABEL_TO_FIELD[normalized] || null
}

function extractLabeledValue(source, labels) {
  const lines = source.split('\n')

  for (const rawLine of lines) {
    const normalizedLine = normalizeText(rawLine).replace(/\s+/g, ' ').trim()

    for (const label of labels) {
      const normalizedLabel = normalizeText(label)
      const matchesLabel =
        normalizedLine.startsWith(normalizedLabel) || normalizedLine.startsWith(`-${normalizedLabel}`)

      if (matchesLabel) {
        const separatorIndex = rawLine.indexOf(':')
        if (separatorIndex >= 0) {
          return rawLine.slice(separatorIndex + 1).trim()
        }

        return rawLine
          .replace(new RegExp(`^[-\\s]*${label}\\s*`, 'i'), '')
          .trim()
      }
    }
  }

  return ''
}

function replaceKeyClinicalLines(template, source) {
  const replacements = Object.fromEntries(
    KEY_LINE_RULES.map((rule) => [rule.key, extractLabeledValue(source, rule.labels)]),
  )

  return template
    .split('\n')
    .map((line) => {
      const normalizedLine = normalizeText(line).replace(/\s+/g, ' ').trim()

      for (const rule of KEY_LINE_RULES) {
        const normalizedTemplateLabel = normalizeText(rule.templateLabel)
        if (normalizedLine.startsWith(`-${normalizedTemplateLabel}`) || normalizedLine.startsWith(normalizedTemplateLabel)) {
          const value = replacements[rule.key]
          if (value) {
            const prefix = line.trimStart().startsWith('-') ? '-' : ''
            return `${prefix}${rule.templateLabel}: ${value}`
          }
        }
      }

      return line
    })
    .join('\n')
}

function extractOxygenLiters(source) {
  const contextSentence = findSentenceByContext(source, ['o2', 'o²', 'oxigenio', 'oxigênio', 'cateter nasal', 'máscara', 'mascara', 'suplementar'])
  const searchSpace = contextSentence || source

  const patterns = [
    /(?:o2|o²|oxigenio|oxigênio)[^\n]{0,40}?\b(1[0-5]|[1-9])\s*(?:l|litros?|lpm|l\/min|x|xl)\b/i,
    /\b(1[0-5]|[1-9])\s*(?:l|litros?|lpm|l\/min)\s*(?:de\s*)?(?:o2|o²|oxigenio|oxigênio)\b/i,
    /\b(1[0-5]|[1-9])\s*(?:l|litros?|lpm|l\/min)\b/i,
    /\b(1[0-5]|[1-9])\s*xl\b/i,
    /\bxl\s*(1[0-5]|[1-9])\b/i,
    /\b(1[0-5]|[1-9])\s*x\b/i,
    /\bx\s*(1[0-5]|[1-9])\b/i,
  ]

  for (const pattern of patterns) {
    const match = searchSpace.match(pattern)
    if (match?.[1]) return Number(match[1])
  }

  return null
}

function detectStatusByContext(source, options, fallback) {
  const normalizedSource = normalizeText(source)
  for (const option of options) {
    if (option.terms.some((term) => normalizedSource.includes(normalizeText(term)))) {
      return option.value
    }
  }
  return fallback
}

function parseVitalSigns(text) {
  const source = text || ''
  const paMatch = source.match(/\b(?:PA|TA)\s*[:=]?\s*(\d{2,3})\s*[x\/]\s*(\d{2,3})\b/i)
  const fcMatch = source.match(/\b(?:FC|HR)\s*[:=]?\s*(\d{2,3})\b/i)
  const satMatch = source.match(/\b(?:SatO2|SpO2|Sat)\s*[:=]?\s*(\d{2,3})\s*%?/i)

  return {
    systolic: paMatch ? Number(paMatch[1]) : null,
    diastolic: paMatch ? Number(paMatch[2]) : null,
    heartRate: fcMatch ? Number(fcMatch[1]) : null,
    saturation: satMatch ? Number(satMatch[1]) : null,
  }
}

function inferHeartRateLabel(vitals) {
  if (vitals.heartRate === null) return ''
  if (vitals.heartRate > 100) return 'taquicárdico'
  if (vitals.heartRate < 50) return 'bradicárdico'
  return 'normocárdico'
}

function inferPressureLabel(vitals) {
  if (vitals.systolic === null || vitals.diastolic === null) return ''
  if (vitals.systolic >= 140 || vitals.diastolic >= 90) return 'hipertenso'
  if (vitals.systolic < 90 || vitals.diastolic < 60) return 'hipotenso'
  return 'normotenso'
}

function inferColorLabel(vitals) {
  if (vitals.heartRate === null && vitals.systolic === null) return ''
  if (vitals.systolic !== null && vitals.systolic < 90 && vitals.heartRate !== null && vitals.heartRate > 110) {
    return 'hipocorado'
  }
  return 'normocorado'
}

function inferCyanosisLabel(vitals) {
  if (vitals.saturation === null) return ''
  if (vitals.saturation <= 90) return 'cianótico'
  return 'acianótico'
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractFindingGrade(source, findingVariants) {
  const normalizedSource = normalizeText(source)
  const variantPattern = findingVariants.map((item) => escapeRegExp(normalizeText(item))).join('|')
  const gradePatterns = [
    /\+?\s*([1-4])\s*\+?\s*\/\s*4\+?/i,
    /([1-4])\s*\+?\s*de\s*4/i,
    /grau\s*([1-4])/i,
  ]

  const normalizedLines = normalizedSource
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of normalizedLines) {
    if (!new RegExp(`(?:${variantPattern})`, 'i').test(line)) continue

    for (const gradePattern of gradePatterns) {
      const match = line.match(gradePattern)
      if (match?.[1]) {
        return `+${match[1]}/+4`
      }
    }
  }

  const sentenceLikeChunks = normalizedSource
    .split(/[.;]/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  for (const chunk of sentenceLikeChunks) {
    if (!new RegExp(`(?:${variantPattern})`, 'i').test(chunk)) continue

    for (const gradePattern of gradePatterns) {
      const match = chunk.match(gradePattern)
      if (match?.[1]) {
        return `+${match[1]}/+4`
      }
    }
  }

  return ''
}

function withDefaultGradeIfNeeded(label, source) {
  const normalizedLabel = normalizeText(label)

  if (normalizedLabel === 'icterico' || normalizedLabel === 'icterica') {
    const directIctericoMatch = source.match(/ict[ée]ric[oa]\s*\+?([1-4])\s*\/?\s*\+?4\+?/i)
    if (directIctericoMatch?.[1]) {
      return `${label} +${directIctericoMatch[1]}/+4`
    }

    const fromSource = extractFindingGrade(source, ['icterico', 'icterica', 'ictérico', 'ictérica', 'ictericia'])
    const grade = fromSource || '+1/+4'
    return `${label} ${grade}`
  }

  if (normalizedLabel === 'hipocorado' || normalizedLabel === 'hipocorada') {
    const directHipocoradoMatch = source.match(/hipocorad[oa]\s*\+?([1-4])\s*\/?\s*\+?4\+?/i)
    if (directHipocoradoMatch?.[1]) {
      return `${label} +${directHipocoradoMatch[1]}/+4`
    }

    const fromSource = extractFindingGrade(source, ['hipocorado', 'hipocorada', 'palidez', 'descorado', 'descorada'])
    return fromSource ? `${label} ${fromSource}` : label
  }

  return label
}

function extractEdemaBySegment(source, segmentVariants, canonicalLabel) {
  const segmentPattern = segmentVariants.map((item) => escapeRegExp(normalizeText(item))).join('|')
  const normalizedSource = normalizeText(source)
  const patterns = [
    new RegExp(`edema\\s+em\\s+(?:${segmentPattern})[^\\n,;:]{0,20}?\\+?([1-4])\\s*\\/?\\s*\\+?4\\+?`, 'i'),
    new RegExp(`edema\\s+em\\s+(?:${segmentPattern})`, 'i'),
  ]

  const gradedMatch = normalizedSource.match(patterns[0])
  if (gradedMatch?.[1]) {
    return `edema em ${canonicalLabel} +${gradedMatch[1]}/+4`
  }

  const simpleMatch = normalizedSource.match(patterns[1])
  if (simpleMatch) {
    return `edema em ${canonicalLabel}`
  }

  return ''
}

function extractEdemaFindings(source) {
  const mmii = extractEdemaBySegment(source, ['mmii', 'mii', 'membros inferiores'], 'MMII')
  const mmss = extractEdemaBySegment(source, ['mmss', 'mss', 'membros superiores'], 'MMSS')

  return [mmii, mmss].filter(Boolean)
}

function normalizePixText(value, maxLength) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\-\.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .toUpperCase()
}

function emvField(id, value) {
  const payload = String(value)
  return `${id}${String(payload.length).padStart(2, '0')}${payload}`
}

function pixCrc16(payload) {
  let crc = 0xffff

  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8

    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021
      } else {
        crc <<= 1
      }
      crc &= 0xffff
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function buildPixPayload({ key, name, city, amount, description, txid }) {
  const pixKey = key.trim()
  if (!pixKey) return ''

  const merchantName = normalizePixText(name || 'EVOLUCAO ENFERMAGEM', 25) || 'EVOLUCAO ENFERMAGEM'
  const merchantCity = normalizePixText(city || 'SAO PAULO', 15) || 'SAO PAULO'
  const pixDescription = normalizePixText(description || '', 99)
  const transactionId = normalizePixText(txid || 'EVO123', 25) || 'EVO123'
  const amountValue = Number(amount)
  const amountField = Number.isFinite(amountValue) && amountValue > 0 ? emvField('54', amountValue.toFixed(2)) : ''

  const additionalData = emvField('05', transactionId)
  const merchantAccount = emvField(
    '26',
    [
      emvField('00', 'br.gov.bcb.pix'),
      emvField('01', pixKey),
      pixDescription ? emvField('02', pixDescription) : '',
    ].join(''),
  )

  const payloadWithoutCrc = [
    emvField('00', '01'),
    emvField('01', '12'),
    merchantAccount,
    emvField('52', '0000'),
    emvField('53', '986'),
    amountField,
    emvField('58', 'BR'),
    emvField('59', merchantName),
    emvField('60', merchantCity),
    emvField('62', additionalData),
    '6304',
  ]
    .filter(Boolean)
    .join('')

  return `${payloadWithoutCrc}${pixCrc16(payloadWithoutCrc)}`
}

function buildAoExameClause(source, values) {
  const explicitAoExame = source.match(/ao exame\s*:\s*([^\n]+)/i)
  if (explicitAoExame?.[1]) {
    const explicitText = explicitAoExame[1].trim().replace(/[.;]\s*$/, '')
    return `Ao exame: ${explicitText}.`
  }

  const vitals = parseVitalSigns(values.sinais_vitais || source)
  const feminine = isFeminineSource(source)

  const icterusRaw = detectStatusByContext(
    source,
    [
      { terms: ['ictérico', 'icterico', 'ictérica', 'icterica'], value: 'ictérico' },
      { terms: ['anictérico', 'anicterico', 'anictérica', 'anicterica'], value: 'anictérico' },
    ],
    'anictérico',
  )
  const icterus = withDefaultGradeIfNeeded(icterusRaw, source).replace(/\bict[eé]rico\b/i, genderedText(source, 'ictérico', 'ictérica')).replace(/\banict[eé]rico\b/i, genderedText(source, 'anictérico', 'anictérica'))

  const cyanosis = detectStatusByContext(
    source,
    [
      { terms: ['cianótico', 'cianotico', 'cianótica', 'cianotica'], value: genderedText(source, 'cianótico', 'cianótica') },
      { terms: ['acianótico', 'acianotico', 'acianótica', 'acianotica'], value: genderedText(source, 'acianótico', 'acianótica') },
    ],
    inferCyanosisLabel(vitals) || genderedText(source, 'acianótico', 'acianótica'),
  )

  const colorRaw = detectStatusByContext(
    source,
    [
      { terms: ['hipocorado', 'hipocorada', 'descorado', 'descorada', 'palidez'], value: genderedText(source, 'hipocorado', 'hipocorada') },
      { terms: ['normocorado', 'normocorada'], value: genderedText(source, 'normocorado', 'normocorada') },
    ],
    inferColorLabel(vitals) || genderedText(source, 'normocorado', 'normocorada'),
  )
  const color = withDefaultGradeIfNeeded(colorRaw, source)

  const temperature = detectStatusByContext(
    source,
    [
      { terms: ['febril', 'febre'], value: 'febril' },
      { terms: ['afebril'], value: 'afebril' },
    ],
    'afebril',
  )

  const heartRate = detectStatusByContext(
    source,
    [
      { terms: ['taquicárdico', 'taquicardico', 'taquicardia', 'taquicárdica', 'taquicardica'], value: genderedText(source, 'taquicárdico', 'taquicárdica') },
      { terms: ['bradicárdico', 'bradicardico', 'bradicardia', 'bradicárdica', 'bradicardica'], value: genderedText(source, 'bradicárdico', 'bradicárdica') },
      { terms: ['normocárdico', 'normocardico', 'normocárdica', 'normocardica'], value: genderedText(source, 'normocárdico', 'normocárdica') },
    ],
    inferHeartRateLabel(vitals) || genderedText(source, 'normocárdico', 'normocárdica'),
  )

  const pressure = detectStatusByContext(
    source,
    [
      { terms: ['hipertenso', 'pa elevada', 'hipertensa'], value: genderedText(source, 'hipertenso', 'hipertensa') },
      { terms: ['hipotenso', 'pa baixa', 'hipotensa'], value: genderedText(source, 'hipotenso', 'hipotensa') },
      { terms: ['normotenso', 'normotensa'], value: genderedText(source, 'normotenso', 'normotensa') },
    ],
    inferPressureLabel(vitals) || genderedText(source, 'normotenso', 'normotensa'),
  )

  const thorax = values.pulmoes
    ? values.pulmoes.replace(/[.;]\s*$/, '')
    : detectStatusByContext(
        source,
        [
          { terms: ['tórax sem abaulamentos', 'torax sem abaulamentos'], value: 'tórax sem abaulamentos' },
          { terms: ['tórax simétrico', 'torax simetrico'], value: 'tórax simétrico' },
        ],
        'tórax sem abaulamentos',
      )

  const abdomen = values.abdome
    ? values.abdome.replace(/[.;]\s*$/, '')
    : detectStatusByContext(
        source,
        [
          { terms: ['abdome flácido', 'abdome flacido'], value: 'abdômen flácido' },
          { terms: ['abdome globoso'], value: 'abdômen globoso' },
          { terms: ['abdome distendido'], value: 'abdômen distendido' },
        ],
        'abdômen globoso',
      )

  const edemaFindings = extractEdemaFindings(source)
  const edemaClause = edemaFindings.length ? `, ${edemaFindings.join(', ')}` : ''

  return `Ao exame: ${icterus}, ${cyanosis}, ${color}, ${temperature}, ${heartRate}, ${pressure}, ${thorax}, ${abdomen}${edemaClause}.`
}

function buildRespiratoryLine(source, values) {
  const normalizedSource = normalizeText(source)
  const dyspneaImprovement = hasDyspneaImprovementContext(source)
  const respiratorySentence = findSentenceByContext(source, ['respir', 'oxigen', 'o2', 'o²', 'desconforto respirat', 'taquipne', 'uso de musculatura', 'tiragem', 'cianose', 'esforco respirat', 'esforço respirat'], ['melhora da dispneia', 'melhora de dispneia', 'dispneia em melhora', 'melhora respiratoria', 'melhora respiratória', 'sem dispneia', 'nega dispneia', 'eupneico', 'eupneica'])
  const oxygenLiters = extractOxygenLiters(source)
  const oxygenSentences = splitSentences(source).filter((sentence) => sentenceHasContext(sentence, ['oxigenio', 'o2', 'o²', 'cateter nasal', 'mascara', 'máscara', 'l/min', 'lpm', 'litro', 'litros', 'xl', ' x '], ['sem oxigenio', 'sem oxigênio', 'ar ambiente', 'aa']))
  const distressSentences = splitSentences(source).filter((sentence) => hasPositiveDyspneaContext(sentence))
  const oxygenSentence = oxygenSentences[0] || ''
  const distressSentence = distressSentences[0] || ''
  const hasOxygenMarker = oxygenLiters !== null || Boolean(oxygenSentence)
  const isRoomAir = containsAny(normalizedSource, ['aa', 'ar ambiente', 'sem oxigenio', 'sem oxigênio'])
  const hasExplicitRespiratoryDistress = Boolean(distressSentence) && !dyspneaImprovement
  const hasImprovementContext = containsAny(normalizedSource, ['melhora da dispneia', 'melhora de dispneia', 'dispneia em melhora', 'melhora respiratoria', 'melhora respiratória', 'em relacao a admissao', 'em relação à admissão'])
  const hasNegativeRespiratoryContext = containsAny(normalizedSource, ['sem desconforto respiratorio', 'sem desconforto respiratório', 'nega dispneia', 'sem dispneia', 'eupneico', 'eupneica', 'melhora da dispneia', 'melhora de dispneia', 'dispneia em melhora', 'melhora respiratoria', 'melhora respiratória', 'em relacao a admissao', 'em relação à admissão'])

  const oxygenClause = oxygenLiters !== null
    ? 'respirando com auxílio de O² (' + oxygenLiters + 'L)'
    : hasOxygenMarker
      ? 'respirando com auxílio de O²'
      : 'respirando sem auxílio de O²'
  const airClause = isRoomAir ? 'em AA' : hasOxygenMarker ? 'em O² suplementar' : 'em AA'
  const discomfortClause = hasExplicitRespiratoryDistress && !hasNegativeRespiratoryContext && !hasImprovementContext
    ? 'com sinais de desconforto respiratório'
    : 'sem sinais de desconforto respiratório'
  const aoExameClause = buildAoExameClause(source, values)
  const awarenessClause = buildAwarenessClause(source)

  if (!respiratorySentence && !hasOxygenMarker && !hasExplicitRespiratoryDistress) {
    return DEFAULT_RESPIRATORY_LINE
  }

  return '- Paciente em box 02 do PS adulto, com presença de acompanhante, ' +
    awarenessClause +
    ', ' +
    oxygenClause +
    ', ' +
    airClause +
    ' e ' +
    discomfortClause +
    `. ${aoExameClause} Segue em dieta VO, com boa aceitação da dieta e sem intercorrências. AVP em MSE pérvio e sem sinais flogísticos. Eliminações vesicais-intestinais espontâneas e sem alterações.`
}

function replaceRespiratoryLine(template, source, values) {
  const respiratoryLine = buildRespiratoryLine(source, values)

  return template
    .split('\n')
    .map((line) => {
      const normalizedLine = normalizeText(line)
      if (normalizedLine.includes('respirando sem auxilio de o²') || normalizedLine.includes('respirando com auxilio de o²')) {
        return respiratoryLine
      }

      return line
    })
    .join('\n')
}

function replaceEntryLine(template, source) {
  const entryLine = buildEntryLine(source)

  return template
    .split('\n')
    .map((line) => {
      if (normalizeText(line).includes(normalizeText(ENTRY_LINE_TEXT))) {
        return entryLine
      }

      return line
    })
    .join('\n')
}

function updateStaticTemplate(template, source, values) {
  const sourceNormalized = normalizeText(source)

  const respiratoryAdjustedTemplate = replaceRespiratoryLine(template, source, values)
  const entryAdjustedTemplate = replaceEntryLine(respiratoryAdjustedTemplate, source)
  const lineLevelTemplate = replaceKeyClinicalLines(entryAdjustedTemplate, source)

  return lineLevelTemplate
    .split('\n')
    .map((line) => {
      if (!line.trim() || line.includes('{{')) return line

      const separatorIndex = line.indexOf(':')
      if (separatorIndex > -1) {
        const label = line.slice(0, separatorIndex).trim()
        const field = mapLabelToField(label)
        if (field && values[field]) {
          return `${line.slice(0, separatorIndex)}: ${values[field]}`
        }
      }

      let updatedLine = line
      for (const rule of CONTRADICTION_RULES) {
        const shouldApply = rule.ifSource.some((term) => sourceNormalized.includes(normalizeText(term)))
        if (shouldApply) {
          updatedLine = updatedLine.replace(rule.from, rule.to)
        }
      }

      for (const rule of CLINICAL_TRANSFORM_RULES) {
        const shouldApply = rule.ifSource.some((term) => sourceNormalized.includes(normalizeText(term)))
        if (shouldApply) {
          updatedLine = updatedLine.replace(rule.from, rule.to)
        }
      }

      return updatedLine
    })
    .join('\n')
}

function toSentences(text) {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.;!?])\s+/))
    .map((item) => item.trim())
    .filter(Boolean)
}

function dedupeByNormalized(items) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const key = normalizeText(item)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

function extractComplements(source, currentOutput) {
  const sentences = toSentences(source)
  const outputNormalized = normalizeText(currentOutput)

  const exams = []
  const opinions = []
  const plans = []

  for (const sentence of sentences) {
    const normalizedSentence = normalizeText(sentence)
    if (outputNormalized.includes(normalizedSentence)) continue

    if (EXAM_PATTERNS.some((pattern) => pattern.test(sentence))) {
      exams.push(sentence)
      continue
    }

    if (OPINION_PATTERNS.some((pattern) => pattern.test(sentence))) {
      opinions.push(sentence)
      continue
    }

    if (PLAN_PATTERNS.some((pattern) => pattern.test(sentence))) {
      plans.push(sentence)
    }
  }

  return {
    exams: dedupeByNormalized(exams),
    opinions: dedupeByNormalized(opinions),
    plans: dedupeByNormalized(plans),
  }
}

function appendComplements(baseText, complements) {
  const blocks = []

  if (complements.exams.length) {
    blocks.push(`Resultados/Exames adicionais:\n${complements.exams.map((item) => `- ${item}`).join('\n')}`)
  }

  if (complements.opinions.length) {
    blocks.push(`Pareceres/Interconsultas:\n${complements.opinions.map((item) => `- ${item}`).join('\n')}`)
  }

  if (complements.plans.length) {
    blocks.push(`Complementos de conduta:\n${complements.plans.map((item) => `- ${item}`).join('\n')}`)
  }

  if (!blocks.length) return baseText
  return `${baseText.trimEnd()}\n\n${blocks.join('\n\n')}\n`
}

async function extractTextFromPdf(file) {
  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pages = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (pageText) {
      pages.push(pageText)
    }
  }

  return pages.join('\n\n').trim()
}

function App() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('facilitador-theme') || 'light'
  })
  const [template, setTemplate] = useState(defaultTemplate)
  const [source, setSource] = useState(sampleSource)
  const [autoUpdateStatic, setAutoUpdateStatic] = useState(true)
  const [autoAddComplements, setAutoAddComplements] = useState(true)
  const [forms, setForms] = useState(defaultForms)
  const [selectedFormId, setSelectedFormId] = useState(defaultForms[0].id)
  const [newFormTitle, setNewFormTitle] = useState('')
  const [newFormContent, setNewFormContent] = useState('')
  const [isNewFormOpen, setIsNewFormOpen] = useState(true)
  const [formUploadFeedback, setFormUploadFeedback] = useState('')
  const [finalText, setFinalText] = useState('')

  const extracted = useMemo(() => extractFields(source), [source])
  const mergedValues = useMemo(() => extracted, [extracted])
  const workingTemplate = useMemo(
    () => (autoUpdateStatic ? updateStaticTemplate(template, source, mergedValues) : template),
    [autoUpdateStatic, template, source, mergedValues],
  )
  const baseFilled = useMemo(() => mergeTemplate(workingTemplate, mergedValues), [workingTemplate, mergedValues])
  const complements = useMemo(() => extractComplements(source, baseFilled), [source, baseFilled])
  const filled = useMemo(
    () => (autoAddComplements ? appendComplements(baseFilled, complements) : baseFilled),
    [autoAddComplements, baseFilled, complements],
  )
  const finalTextWithScales = useMemo(() => applyAutomaticScales(finalText, source), [finalText, source])
  const riskBreakdown = useMemo(() => {
    const combinedText = `${finalTextWithScales}\n${source}`.trim()
    const analysisText = stripScaleLine(combinedText)
    const fallback = parseExistingScales(combinedText)

    return {
      braden: evaluateBraden(analysisText, fallback.braden),
      morse: evaluateMorse(analysisText, fallback.morse),
      eva: evaluateEva(analysisText, fallback.eva),
    }
  }, [finalTextWithScales, source])
  const [isRiskBreakdownOpen, setIsRiskBreakdownOpen] = useState(true)
  const [activeTab, setActiveTab] = useState('facilitador')
  const [pixKey] = useState(FIXED_PIX_KEY)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('facilitador-theme', theme)
  }, [theme])

  const procedures = [
    {
      id: 'sonda-vesical',
      title: 'Passagem de Sonda Vesical de Demora (SVD)',
      description: 'Procedimento estéril de introdução de cateter vesical com balão para drenagem de urina contínua ou intermitente em pacientes com retenção urinária ou incontinência.',
      videoUrl: 'https://www.youtube.com/embed/O12BBzZ4ERQ',
      steps: [
        'Preparar material estéril: sonda adequada, lubrificante, seringa com soro fisiológico',
        'Higienizar mãos e paramentar com EPI apropriado (gorro, máscara, luva estéril)',
        'Posicionar paciente em decúbito dorsal, com pernas afastadas à altura do quadril',
        'Realizar antissepsia da região genital com soro fisiológico ou clorexidina a 0,5%',
        'Lubrifique abundantemente a ponta da sonda com lubrificante estéril à base de água',
        'Tracionar o pênis (em homens) ou afastar os grandes lábios (em mulheres) para visualizar o meato',
        'Avançar a sonda lentamente até visualizar retorno de urina (20-25 cm em homens, 5-7 cm em mulheres)',
        'Insuflar o balão com água destilada (nunca ar, SF 0,9% cristaliza e pode causar problemas), conforme fabricante da sonda, puxando levemente para confirmar fixação',
        'Conectar bolsa coletora e fixar sonda com esparadrapo ou cinta abdominal de sustentação',
        'Registrar horário, volume, aspecto da urina e intercorrências na evolução'
      ],
    },
    {
      id: 'sonda-nasoenteral',
      title: 'Passagem de Sonda Nasogástrica (SNG)',
      description: 'Técnica de introdução de sonda via nasofaringe até o estômago para lavagem gástrica, coleta de amostra gástrica ou descompressão abdominal.',
      videoUrl: 'https://www.youtube.com/embed/1oAxjIGMQPc',
      steps: [
        'Avaliar permeabilidade nasal bilateralmente; preferir a narina com melhor fluxo aéreo',
        'Paciente em posição sentado ou semi-Fowler com cabeça alinhada',
        'Medir o comprimento da sonda pelo novo método NOU: utiliza como referência a medida da ponta do nariz ao lóbulo da orelha e depois até a cicatriz umbilical',
        'Lubrificar bem a sonda com xilocaína gel',
        'Introduzir sonda pela narina escolhida em ângulo de 45° para baixo, avançando durante a deglutição do paciente',
        'Ao atingir a orofaringe, solicitar ao paciente que flexione o queixo e continue engolindo para facilitar passagem',
        'Continuar avançamento até marca previamente medida; confirmar posicionamento gástrico com teste de pH (≤5,5), ausculta de ar ou raio X',
        'Fixar sonda com esparadrapo ou adesivo hipo-alergênico no nariz; registrar comprimento externo permanente',
        'Higienizar narina diariamente'
      ],
    },
    {
      id: 'sonda-enteral',
      title: 'Nutrição Enteral por Sonda Nasoentérica',
      description: 'Técnica avançada de colocação de sonda com ponta além do píloro (duodeno/jejuno) para nutrição em pacientes com alto risco de aspiração ou gastroparesia.',
      videoUrl: 'https://www.youtube.com/embed/tY7IFN3EcoI',
      steps: [
        'Indicada quando há alto risco de aspiração ou intolerância gástrica; exige confirmação radiológica de posicionamento',
        'Usar sonda de menor calibre (8-10 Fr) com guia metálico removível para facilitar passagem pós-pilórica',
        'Lubrificar a sonda e o guia com água destilada; inserir via nasal como na SNG até alcance o estômago',
        'Posicionar paciente em decúbito direito para facilitar passagem pós-pilórica do cateter',
        'Avançar sonda lentamente até passagem visível pelo píloro (fluoro-endoscopia) ou confirmação radiológica',
        'Retirar o guia apenas após confirmação de posicionamento correto no duodeno/jejuno por radiografia',
        'Iniciar infusão em velocidade baixa (10-20 mL/h) e aumentar gradualmente conforme tolerabilidade do paciente',
        'Manter cabeceira elevada 30° mínimo durante infusões contínuas para reduzir risco de refluxo',
        'Monitorar intolerância digestiva (distensão, resíduos, diareia); reavaliar posicionamento se houver desequilíbrios'
      ],
    },
    {
      id: 'bomba-infusao-bbraun',
      title: 'Bomba de Infusão Volumétrica B-Braun',
      description: 'Operação segura de bombas infusoras volumétricas para administração controlada e precisa de medicamentos e fluidos.',
      videoUrl: 'https://www.youtube.com/embed/mNYa5z4scF4',
      steps: [
        'Revisar o manual do equipamento B-Braun específico disponível na unidade (modelos variam)',
        'Verificar funcionamento da bomba: tela acesa, bateria, conexões de ar e eletrodos',
        'Preparar acesso venoso pérvio; conectar equipo com válvula anti-refluxo se necessário',
        'Primir o equipo removendo ar e colocar a bolsa/seringa na posição correta do suporte de IV estabilizado',
        'Abrir o grampo do equipo e posicionar na câmara de gotejamento com o sistema pressurizado conforme modelo',
        'Configurar no painel: volume total a infundir (em mL), velocidade (mL/h), horário de parada; confirmar dados antes de iniciar',
        'Selecionar tipo de veia (periférica ou central) e modo de infusão (contínua, intermitente ou bolus)',
        'Iniciar infusão; monitorar sinais visuais (LED verde = funcionamento normal, alarmes = problemas)',
        'Realizar inspeção visual do acesso a cada hora ou conforme protocolo; se houver risco de infiltração, parar imediatamente'
      ],
    },
    {
      id: 'cuidados-pump',
      title: 'Manutenção e Monitoramento de Bombas de Infusão',
      description: 'Cuidados essenciais com bombas de infusão para garantir funcionamento seguro, prevenir complicações e prolongar vida útil do equipamento.',
      videoUrl: 'https://www.youtube.com/embed/i_LX_rLm8_w',
      steps: [
        'Inspecionar diariamente a bomba antes de usar: tela, botões, cabos, indicadores de bateria',
        'Limpar superfícies externas e áreas de contato com álcool 70% (nunca imergir a bomba em líquido)',
        'Verificar integridade do equipo: buscar vazamentos, desconexões, descolorações ou cristalização de medicamentos',
        'Treinar paciente/acompanhante sobre sinais alarme e quando chamar enfermeira (som contínuo, tela vermelha, sem infusão)',
        'Monitorar site de inserção a cada 2-4 horas: cor da pele, temperatura, edema, dor, presença de hematoma ou extravasamento',
        'Documentar início e parada de infusão com horário, medicamento, volume, velocidade, site e observações no prontuário',
        'Se houver alarme de oclusão: interromper temporariamente, verificar mangueira, linha IV, acessórios; chamar enfermeira',
        'Trocar equipo conforme protocolo da instituição (usualmente a cada 72-96 horas ou se houver dano/contaminação)',
        'Reportar mau funcionamento ou suspeita de defeito; ligar para engenharia biomédica; nunca tentar reparar manualmente'
      ],
    },
  ]

  const lesionGuides = [
    {
      id: 'lpp',
      title: 'LPPs (Lesões por Pressão)',
      summary: 'Lesões de pele e tecido subjacente causadas por pressão prolongada, cisalhamento e fricção, comuns em regiões de proeminências ósseas.',
      coverings: [
        'LPP estágio 1 (pele íntegra, hiperemia não branqueável): filme transparente e espuma de silicone para proteção e alívio de pressão.',
        'LPP estágio 2 (perda parcial da pele): espuma de silicone, hidrocoloide fino ou hidrofibra quando houver exsudato leve a moderado.',
        'LPP estágio 3/4 e lesão cavitária: hidrofibra com prata (se suspeita de infecção), alginato para alto exsudato e espumas de alta absorção como cobertura secundária.',
        'Presença de necrose/esfacelo: desbridamento conforme avaliação clínica (autolítico com hidrogel ou enzimático quando indicado), com proteção das bordas.',
      ],
      care: [
        'Reposicionar paciente no leito regularmente, com mudança de decúbito e uso de superfícies de alívio de pressão.',
        'Controlar umidade (incontinência, suor), manter pele limpa e hidratada com barreira cutânea.',
        'Mensurar lesão (comprimento, largura, profundidade), registrar exsudato, odor, dor e evolução fotográfica conforme protocolo institucional.',
        'Garantir suporte nutricional e hidratação adequados, pois impactam diretamente cicatrização.',
      ],
      warning: 'Sinais de piora (dor intensa, necrose progressiva, febre, exsudato purulento) exigem reavaliação médica e da equipe de feridas.',
    },
    {
      id: 'queimaduras',
      title: 'Queimaduras (Térmicas, Químicas e Elétricas)',
      summary: 'Lesões causadas por agentes térmicos, químicos ou elétricos, com risco de perda de barreira cutânea, infecção e instabilidade clínica.',
      coverings: [
        'Queimadura superficial: limpeza com solução adequada e cobertura não aderente com gaze vaselinada ou espuma de silicone.',
        'Queimadura de espessura parcial com exsudato: hidrofibra, alginato ou espuma absorvente; prata pode ser usada quando houver alto risco de colonização crítica.',
        'Queimaduras mais extensas/profundas: coberturas antimicrobianas (ex.: prata) e avaliação especializada precoce para possível abordagem cirúrgica.',
        'Evitar coberturas aderentes secas diretamente sobre o leito da ferida para não causar trauma na troca.',
      ],
      care: [
        'Resfriar a área com água corrente em fase inicial (sem gelo) quando aplicável e dentro de janela de atendimento.',
        'Avaliar extensão, profundidade, dor e áreas críticas (face, mãos, pés, genitais, grandes articulações).',
        'Manter técnica asséptica rigorosa, analgesia adequada e monitorização de sinais de infecção.',
        'Encaminhar para centro especializado em queimados quando houver critérios de gravidade.',
      ],
      warning: 'Queimaduras extensas, em vias aéreas, elétricas ou químicas graves são urgências e demandam manejo especializado imediato.',
    },
    {
      id: 'erisipela',
      title: 'Erisipela e Celulite Associada',
      summary: 'Infecção bacteriana da pele e tecido subcutâneo, geralmente com eritema, calor, dor e edema, mais frequente em membros inferiores.',
      coverings: [
        'Sem ferida aberta: foco em cuidado da pele, hidratação e proteção; curativo pode não ser necessário.',
        'Com porta de entrada (fissura, úlcera, escoriação): cobertura não aderente e absorvente conforme exsudato, com troca conforme saturação.',
        'Exsudato moderado/alto: espuma absorvente ou alginato/hidrofibra como curativo primário em lesões abertas.',
      ],
      care: [
        'Elevar membro acometido para reduzir edema e dor.',
        'Demarcar bordas do eritema e monitorar progressão clínica diariamente.',
        'Realizar higiene adequada da pele e tratar portas de entrada (micoses interdigitais, fissuras, traumas).',
        'Acompanhar resposta ao antibiótico prescrito e sinais sistêmicos (febre, mal-estar, taquicardia).',
      ],
      warning: 'Piora clínica, dor desproporcional, bolhas extensas ou sinais sistêmicos importantes sugerem gravidade e precisam de reavaliação imediata.',
    },
    {
      id: 'fournier',
      title: 'Síndrome de Fournier',
      summary: 'Fasciíte necrosante de períneo/genitais, de rápida progressão e alto risco de sepse. É emergência cirúrgica.',
      coverings: [
        'Pós-desbridamento: cobertura de alta absorção (alginato/hidrofibra/espuma) para controle de exsudato abundante.',
        'Quando indicado pela equipe: terapia por pressão negativa pode auxiliar no preparo do leito e granulação.',
        'Em áreas com colonização crítica/infeção local: considerar cobertura antimicrobiana (ex.: prata) conforme protocolo institucional.',
      ],
      care: [
        'Prioridade é suporte intensivo, antibiótico de amplo espectro e desbridamento cirúrgico precoce e repetido quando necessário.',
        'Realizar curativos frequentes com técnica estéril, controle rigoroso de dor e balanço hídrico.',
        'Monitorar sinais de sepse, perfusão tecidual, glicemia e função renal, principalmente em pacientes com comorbidades.',
        'Registrar evolução da ferida em detalhe e alinhar conduta multiprofissional diária.',
      ],
      warning: 'Fournier não deve ser manejada apenas com curativo local. A abordagem cirúrgica e clínica urgente é determinante para sobrevida.',
    },
  ]

  const pixPayload = useMemo(
    () =>
      buildPixPayload({
        key: pixKey,
      }),
    [pixKey],
  )

  useEffect(() => {
    setFinalText(filled)
  }, [filled])

  const selectedForm = useMemo(
    () => forms.find((form) => form.id === selectedFormId) || forms[0],
    [forms, selectedFormId],
  )

  const selectedFormOutput = useMemo(
    () => (selectedForm ? mergeTemplate(selectedForm.content, mergedValues) : ''),
    [selectedForm, mergedValues],
  )

  function addForm() {
    if (!newFormTitle.trim() || !newFormContent.trim()) return

    const id = `form-${Date.now()}`
    const newForm = {
      id,
      title: newFormTitle.trim(),
      content: newFormContent,
    }

    setForms((prev) => [...prev, newForm])
    setSelectedFormId(id)
    setNewFormTitle('')
    setNewFormContent('')
    setFormUploadFeedback('Formulário adicionado com sucesso.')
  }

  async function importFormFromFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const fileName = file.name || 'formulário'
    const isPdf = /\.pdf$/i.test(fileName)
    const unsupportedExt = /\.(doc|docx)$/i.test(fileName)
    if (unsupportedExt) {
      setFormUploadFeedback('Formato não suportado para leitura direta. Use .pdf, .txt, .md, .rtf ou .csv.')
      event.target.value = ''
      return
    }

    try {
      if (isPdf) {
        setFormUploadFeedback('Lendo PDF, aguarde...')
      }

      const text = isPdf ? await extractTextFromPdf(file) : (await file.text()).trim()

      if (!text) {
        setFormUploadFeedback('Não foi possível extrair texto do arquivo selecionado.')
        event.target.value = ''
        return
      }

      const inferredTitle = fileName.replace(/\.[^/.]+$/, '').trim() || 'Formulário importado'
      const id = `form-${Date.now()}`
      const importedForm = {
        id,
        title: inferredTitle,
        content: text,
      }

      setForms((prev) => [...prev, importedForm])
      setSelectedFormId(id)
      setNewFormTitle(inferredTitle)
      setNewFormContent(text)
      setIsNewFormOpen(true)
      setFormUploadFeedback('Formulário importado do computador e selecionado.')
    } catch {
      setFormUploadFeedback('Erro ao ler arquivo. Para PDF, confirme se o arquivo contém texto selecionável.')
    } finally {
      event.target.value = ''
    }
  }

  function useSelectedAsTemplate() {
    if (!selectedForm) return
    setTemplate(selectedForm.content)
  }

  function printSelectedForm() {
    if (!selectedFormOutput.trim()) return

    const safeHtml = selectedFormOutput
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return

    printWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${selectedForm.title}</title>
          <style>
            body { font-family: Georgia, 'Times New Roman', serif; margin: 28px; color: #111; }
            h1 { font-size: 20px; margin: 0 0 16px; }
            pre { white-space: pre-wrap; font-size: 14px; line-height: 1.55; margin: 0; }
          </style>
        </head>
        <body>
          <h1>${selectedForm.title}</h1>
          <pre>${safeHtml}</pre>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  function printFinalText() {
    if (!finalTextWithScales.trim()) return

    const safeHtml = finalTextWithScales
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return

    printWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Evolução de enfermagem</title>
          <style>
            body { font-family: Georgia, 'Times New Roman', serif; margin: 28px; color: #111; }
            h1 { font-size: 20px; margin: 0 0 16px; }
            pre { white-space: pre-wrap; font-size: 14px; line-height: 1.55; margin: 0; }
          </style>
        </head>
        <body>
          <h1>Evolução de enfermagem</h1>
          <pre>${safeHtml}</pre>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  function downloadFinalPdf() {
    if (!finalTextWithScales.trim()) return

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const marginLeft = 40
    const maxWidth = 515
    const lineHeight = 16
    let cursorY = 56

    doc.setFont('times', 'bold')
    doc.setFontSize(14)
    doc.text('Evolução de enfermagem', marginLeft, cursorY)
    cursorY += 20

    doc.setFont('times', 'normal')
    doc.setFontSize(11)
    const lines = doc.splitTextToSize(finalTextWithScales, maxWidth)

    for (const line of lines) {
      if (cursorY > 790) {
        doc.addPage()
        cursorY = 56
      }
      doc.text(line, marginLeft, cursorY)
      cursorY += lineHeight
    }

    doc.save('evolucao-medica.pdf')
  }

  return (
    <div className="app-shell">
      <button
        type="button"
        className="theme-toggle"
        onClick={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
        aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      >
        <span className="theme-toggle-track" aria-hidden="true">
          <span className="theme-toggle-icon theme-toggle-sun">☀</span>
          <span className="theme-toggle-icon theme-toggle-moon">🌙</span>
          <span className={`theme-toggle-thumb ${theme === 'dark' ? 'dark' : 'light'}`} />
        </span>
      </button>
      <aside className="sidebar panel">
        <h2>Aba de Formulários</h2>
        <small>Crie, selecione e imprima formulários sem sair da evolução.</small>

        <div className="forms-list">
          {forms.map((form) => (
            <button
              key={form.id}
              type="button"
              className={`form-item ${selectedFormId === form.id ? 'active' : ''}`}
              onClick={() => setSelectedFormId(form.id)}
            >
              {form.title}
            </button>
          ))}
        </div>

        <div className="row-actions">
          <button type="button" className="action" onClick={useSelectedAsTemplate}>
            Usar no modelo
          </button>
          <button type="button" className="action" onClick={printSelectedForm}>
            Imprimir formulário
          </button>
        </div>

        <button
          type="button"
          className="action ghost"
          onClick={() => setIsNewFormOpen((prev) => !prev)}
          aria-expanded={isNewFormOpen}
        >
          {isNewFormOpen ? 'Fechar adição de formulário' : 'Abrir adição de formulário'}
        </button>

        {isNewFormOpen && (
          <>
            <h3>Novo formulário</h3>
            <input
              className="input file-input"
              type="file"
              accept=".pdf,.txt,.md,.rtf,.csv"
              onChange={importFormFromFile}
            />
            <small>Importe um formulário do seu computador (.pdf, .txt, .md, .rtf, .csv).</small>
            {formUploadFeedback && <small className="upload-feedback">{formUploadFeedback}</small>}
            <input
              className="input"
              value={newFormTitle}
              onChange={(event) => setNewFormTitle(event.target.value)}
              placeholder="Título do formulário"
            />
            <textarea
              className="small-textarea"
              value={newFormContent}
              onChange={(event) => setNewFormContent(event.target.value)}
              placeholder={'Texto do formulário\nUse campos como {{paciente}}, {{data}}, {{diagnostico}}'}
            />
            <button type="button" className="action full" onClick={addForm}>
              Adicionar formulário
            </button>
          </>
        )}
      </aside>

      <main className="layout">
        <section className="header-card">
          <h1>Evolução Enfermagem</h1>
          <p>Coloque seu modelo padrão, adicione o texto da evolução e receba o preenchimento automático.</p>
          <div className="tab-navigation">
            <button
              type="button"
              className={`tab-button ${activeTab === 'facilitador' ? 'active' : ''}`}
              onClick={() => setActiveTab('facilitador')}
            >
              Facilitador
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'treinamento' ? 'active' : ''}`}
              onClick={() => setActiveTab('treinamento')}
            >
              Treinamento Procedimentos
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'lesoes' ? 'active' : ''}`}
              onClick={() => setActiveTab('lesoes')}
            >
              Lesões
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'doacao' ? 'active' : ''}`}
              onClick={() => setActiveTab('doacao')}
            >
              Doação
            </button>
          </div>
        </section>

        {activeTab === 'facilitador' && (
          <>
            <section className="grid-2">
          <article className="panel">
            <h2>Padrão de Evolução</h2>
            <textarea value={template} onChange={(event) => setTemplate(event.target.value)} />
            <small>
              Use marcadores como {'{{paciente}}'}, {'{{idade}}'}, {'{{diagnostico}}'}, {'{{conduta}}'}.
            </small>
            <label className="switch">
              <input
                type="checkbox"
                checked={autoUpdateStatic}
                onChange={(event) => setAutoUpdateStatic(event.target.checked)}
              />
              Ajustar automaticamente trechos fixos do modelo com base no texto médico.
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={autoAddComplements}
                onChange={(event) => setAutoAddComplements(event.target.checked)}
              />
              Incluir automaticamente complementos ausentes (exames, pareceres e condutas extras).
            </label>
          </article>

          <article className="panel">
            <h2>Evolução</h2>
            <textarea value={source} onChange={(event) => setSource(event.target.value)} />
            <small>Cole a evolução bruta aqui para extração dos dados.</small>
          </article>
        </section>

        <section className="panel output">
          <h2>Resultado Final</h2>
          <small>Você pode editar o texto final; as escalas de BRADEN, MORSE e EVA são recalculadas automaticamente.</small>
          <div className="scale-breakdown">
            <div className="scale-breakdown-header">
              <div className="scale-breakdown-title">
                <strong>Escalas de risco em detalhe</strong>
                <span>
                  BRADEN {riskBreakdown.braden.label} ({riskBreakdown.braden.score}) | MORSE {riskBreakdown.morse.label} ({riskBreakdown.morse.score}) | EVA {riskBreakdown.eva.label} ({riskBreakdown.eva.score})
                </span>
              </div>
              <button
                type="button"
                className="action ghost scale-toggle"
                onClick={() => setIsRiskBreakdownOpen((prev) => !prev)}
                aria-expanded={isRiskBreakdownOpen}
                aria-label={isRiskBreakdownOpen ? 'Minimizar escalas' : 'Expandir escalas'}
              >
                {isRiskBreakdownOpen ? '▼' : '▶'}
              </button>
            </div>
            {isRiskBreakdownOpen && (
              <>
                <h4 className="scale-section-title">BRADEN</h4>
                <div className="scale-grid">
                  {riskBreakdown.braden.components?.map((component) => (
                    <div key={component.name} className={`scale-card ${component.matched ? 'matched' : ''}`}>
                      <div className="scale-card-head">
                        <strong>{component.name}</strong>
                        <span>{component.points} pts</span>
                      </div>
                      <small>{component.reason}</small>
                    </div>
                  ))}
                </div>
                <h4 className="scale-section-title">MORSE</h4>
                <div className="scale-grid">
                  {riskBreakdown.morse.components?.map((component) => (
                    <div key={component.name} className={`scale-card ${component.matched ? 'matched' : ''}`}>
                      <div className="scale-card-head">
                        <strong>{component.name}</strong>
                        <span>{component.points} pts</span>
                      </div>
                      <small>{component.reason}</small>
                    </div>
                  ))}
                </div>
                <h4 className="scale-section-title">EVA</h4>
                <div className="scale-grid scale-grid-single">
                  {riskBreakdown.eva.components?.map((component) => (
                    <div key={component.name} className={`scale-card ${component.matched ? 'matched' : ''}`}>
                      <div className="scale-card-head">
                        <strong>{component.name}</strong>
                        <span>{component.points} pts</span>
                      </div>
                      <small>{component.reason}</small>
                    </div>
                  ))}
                </div>
                <small>A leitura detalha os critérios usados para BRADEN, MORSE e EVA.</small>
              </>
            )}
          </div>
          <div className="row-actions row-actions-inline">
            <button type="button" className="action" onClick={printFinalText}>
              Imprimir resultado
            </button>
            <button type="button" className="action" onClick={downloadFinalPdf}>
              Baixar PDF
            </button>
          </div>
          <textarea value={finalTextWithScales} onChange={(event) => setFinalText(event.target.value)} />
        </section>
          </>
        )}

        {activeTab === 'treinamento' && (
          <>
            <section className="training-section">
              <h2>Treinamento de Procedimentos de Enfermagem</h2>
              <p>Materiais educativos com vídeos para aprendizado contínuo de procedimentos clínicos essenciais.</p>
              
              <div className="procedures-grid">
                {procedures.map((procedure) => (
                  <article key={procedure.id} className="procedure-card">
                    <h3>{procedure.title}</h3>
                    <p className="procedure-description">{procedure.description}</p>
                    
                    <div className="video-container">
                      <iframe
                        width="100%"
                        height="315"
                        src={procedure.videoUrl}
                        title={procedure.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      ></iframe>
                    </div>
                    
                    <div className="steps-container">
                      <h4>Passos principais:</h4>
                      <ol className="steps-list">
                        {procedure.steps.map((step, index) => (
                          <li key={index}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === 'lesoes' && (
          <>
            <section className="training-section lesion-section">
              <h2>Guia de Lesões e Curativos</h2>
              <p>Conteúdo educativo para apoio à prática assistencial. As condutas devem seguir protocolo institucional e avaliação clínica individual.</p>

              <div className="lesion-grid">
                {lesionGuides.map((lesion) => (
                  <article key={lesion.id} className="procedure-card lesion-card">
                    <h3>{lesion.title}</h3>
                    <p className="procedure-description">{lesion.summary}</p>

                    <div className="steps-container">
                      <h4>Melhores coberturas e curativos</h4>
                      <ul className="steps-list">
                        {lesion.coverings.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="steps-container">
                      <h4>Orientações de cuidado</h4>
                      <ul className="steps-list">
                        {lesion.care.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <small className="lesion-warning">Atenção: {lesion.warning}</small>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === 'doacao' && (
          <>
            <section className="training-section donation-section">
              <h2>Doação para o projeto</h2>
              <p>Use a chave Pix fixa abaixo ou escaneie o QR Code.</p>

              <div className="donation-grid">
                <article className="panel donation-card">
                  <h3>Pix da doação</h3>
                  <label className="donation-field">
                    <span>Chave Pix (fixa)</span>
                    <input
                      className="input donation-input"
                      type="text"
                      value={pixKey}
                      readOnly
                      placeholder="Defina a chave fixa no código"
                    />
                  </label>

                  <div className="pix-preview">
                    {pixPayload ? (
                      <img
                        className="pix-qr"
                        alt="QR Code Pix"
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(pixPayload)}`}
                      />
                    ) : (
                      <div className="pix-qr empty">Digite a chave Pix para gerar o QR</div>
                    )}
                  </div>
                  <small className="donation-status">Escaneie no aplicativo do banco para realizar a doação.</small>
                </article>
              </div>
            </section>
          </>
        )}

        <footer className="app-footer" aria-label="Créditos do desenvolvedor">
          <span className="footer-lamp" aria-hidden="true">💡</span>
          <small>Desenvolvido pelo enfermeiro Diogo da Cunha</small>
        </footer>
      </main>
    </div>
  )
}

export default App
