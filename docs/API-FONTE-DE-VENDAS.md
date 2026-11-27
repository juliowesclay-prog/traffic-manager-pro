# API da fonte de vendas

É por aqui que os sistemas de uma empresa (site, loja, CRM, Prosed+ Saúde…) avisam o Traffic Manager Pro
de **cadastros**, **vendas** e **estornos**. Com isso o sistema calcula CAC e retorno por campanha e por
anúncio, e (se ligada) envia as conversões para a Meta.

**Nunca envie dados pessoais** (nome, CPF, telefone, e-mail). O `id` é o código do cliente ou do pedido
no seu sistema.

## Endereço e chave

```
POST https://<endereço-do-traffic-manager>/api/v1/eventos
Authorization: Bearer tmp_xxxxxxxx_<segredo>
Content-Type: application/json
```

- A chave é gerada em **Empresas → (empresa) → Chaves da API**. Ela é mostrada **uma única vez**; o banco guarda só o hash.
- Cada chave pertence a uma empresa: os eventos caem só nela.
- Revogar a chave ou suspender a empresa faz a API responder `401`.
- Limite: 600 requisições por minuto por chave; corpo de até 512 KB; até 100 eventos por envio.

## Eventos

Um evento sozinho, ou vários em `{ "eventos": [ ... ] }`.

| tipo | Campos | Observações |
|---|---|---|
| `cadastro` | `id` (obrigatório), `quando`, `origem`, `clicado_em` | `origem` é o endereço completo em que a pessoa chegou (com `utm_*` e `fbclid`). Sem `origem`, o cadastro fica "sem origem". |
| `venda` | `id`, `cliente` (o `id` do cadastro), `valor` em reais (ex.: `49.9`), `primeira` (padrão `true`), `quando` | O cadastro precisa ter sido enviado antes. |
| `estorno` | `id` (o `id` da venda), `quando` | A receita do período é descontada. |

- `id`: letras, números e `_ . : @ -`, até 100 caracteres.
- `quando`: data ISO (ex.: `2026-11-26T10:00:00-03:00`). Sem ele, vale a hora do envio. Não aceita data futura nem mais de 400 dias atrás.

Exemplo:

```bash
curl -X POST https://<endereço>/api/v1/eventos \
  -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"eventos":[
    {"tipo":"cadastro","id":"cliente-123","origem":"https://seusite.com.br/assinar?utm_source=facebook&utm_campaign=120200000001&utm_term=120200000002&utm_content=120200000003&fbclid=IwAR..."},
    {"tipo":"venda","id":"pedido-987","cliente":"cliente-123","valor":49.90}
  ]}'
```

## Resposta

`200` com o resultado de cada item, na mesma ordem:

```json
{ "itens": [ { "indice": 0, "status": "gravado" }, { "indice": 1, "status": "repetido" },
             { "indice": 2, "status": "erro", "erro": "Cliente não encontrado: envie o cadastro antes da venda." } ] }
```

- `gravado`: entrou agora. `repetido`: o mesmo `id` já tinha chegado (pode reenviar sem medo de duplicar). `erro`: veja a mensagem.
- Outros códigos: `401` chave inválida, revogada ou empresa suspensa; `400` JSON inválido ou lote vazio/grande demais; `413` corpo grande demais; `429` limite por minuto (tente após `Retry-After`).

## Parâmetros nos anúncios da Meta

Para o cadastro ser ligado à campanha e ao anúncio, configure nos anúncios (campo "Parâmetros de URL"):

```
utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}
```

A Meta acrescenta o `fbclid` sozinha. O código do clique (`fbclid`) é apagado depois de 90 dias (LGPD).
