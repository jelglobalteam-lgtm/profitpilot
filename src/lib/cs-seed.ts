import type { CsClass } from "@/lib/cs-types";

/** Templates base (ficheiro 04). O texto final por loja/idioma é preenchido depois. */
export const CS_SEED_TEMPLATES: { label: string; classification: CsClass }[] = [
  { label: "Estado da encomenda dentro do prazo", classification: "verde" },
  { label: "Pedir n.º de encomenda ou email", classification: "verde" },
  { label: "Compra não concluída (checkout abandonado)", classification: "verde" },
  { label: "Confirmação não recebida, encomenda existe", classification: "verde" },
  { label: "Cancelamento com encomenda já despachada", classification: "verde" },
  { label: "Troca de tamanho", classification: "amarelo" },
  { label: "Devolução, 1.º contacto (crédito 15% e fotos)", classification: "amarelo" },
  { label: "Devolução, cliente insiste (morada e crédito 30%)", classification: "amarelo" },
  { label: "Aconselhar tamanho", classification: "amarelo" },
  { label: "Métodos de pagamento", classification: "verde" },
  { label: "Loja física / localização", classification: "amarelo" },
  { label: "Alteração de morada", classification: "amarelo" },
  { label: "Atraso ou envio parado", classification: "amarelo" },
  { label: "Artigo diferente do anunciado / material", classification: "vermelho" },
  { label: "Proposta comercial não solicitada", classification: "verde" },
  { label: "Insulto ou ameaça", classification: "vermelho" },
];
