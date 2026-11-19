// Regra padrão de ofuscação de query string do dd-trace 6.25.0 (credenciais, bearer e JWT),
// copiada literalmente de DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP. Informar uma regex
// própria ao dd-trace substitui a padrão, então ela é mantida aqui e só se acrescenta o CPF.
// Rever esta cópia a cada atualização do dd-trace; o spec compara com a regra instalada.
export const REGEX_PADRAO_DD_TRACE_6_25_0 = String.raw`(?:(?:"|%22)?)(?:(?:old[-_]?|new[-_]?)?p(?:ass)?w(?:or)?d(?:1|2)?|pass(?:[-_]?phrase)?|secret|(?:api[-_]?|private[-_]?|public[-_]?|access[-_]?|secret[-_]?|app(?:lication)?[-_]?)key(?:[-_]?id)?|token|consumer[-_]?(?:id|key|secret)|sign(?:ed|ature)?|auth(?:entication|orization)?)(?:(?:\s|%20)*(?:=|%3D)[^&]+|(?:"|%22)(?:\s|%20)*(?::|%3A)(?:\s|%20)*(?:"|%22)(?:%2[^2]|%[^2]|[^"%])+(?:"|%22))|(?:bearer(?:\s|%20)+[a-z0-9._\-]+|token(?::|%3A)[a-z0-9]{13}|gh[opsu]_[0-9a-zA-Z]{36}|(^|[^\w%-]|%[0-9a-f]{2})ey[I-L][\w-]+(?:=|%3D)*\.ey[I-L][\w-]+(?:=|%3D)*(?:\.(?:[\w.+/=-]|%3D|%2F|%2B)+)?|-{5}BEGIN(?:[a-z\s]|%20)+PRIVATE(?:\s|%20)KEY-{5}[^\-]+-{5}END(?:[a-z\s]|%20)+PRIVATE(?:\s|%20)KEY(?:-{5})?(?:\n|%0A)?|(?:ssh-(?:rsa|dss)|ecdsa-[a-z0-9]+-[a-z0-9]+)(?:\s|%20|%09)+(?:[a-z0-9/.+]|%2F|%5C|%2B){100,}(?:=|%3D)*(?:(?:\s|%20|%09)+[a-z0-9._-]+)?)`;

// O CPF trafega na query string de GET /internal/clientes?cpf= (contrato v1) e o
// dd-trace grava a URL completa em http.url. Cobre cpf e variações como cpfCnpj.
const REGEX_CPF = String.raw`(?<=^|&)cpf\w*(?:=|%3D)[^&]*`;

// Com regex própria o dd-trace troca o trecho casado inteiro por <redacted>.
export const REGEX_OFUSCACAO_QUERY_STRING_APM = `${REGEX_PADRAO_DD_TRACE_6_25_0}|${REGEX_CPF}`;
