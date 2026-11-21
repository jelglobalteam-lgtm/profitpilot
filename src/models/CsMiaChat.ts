import mongoose, { Schema } from "mongoose";

/** Conversa do WhatsApp com a Mia, linha a linha, das duas pessoas (serve de contexto à rotina e ao Claude). */
const CsMiaChatSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    /** Momento da mensagem na conversa. */
    at: { type: Date, required: true },
    /** mia = escrita pela Mia; emanuel = escrita por ele (ou por quem exportou a conversa). */
    from: { type: String, enum: ["mia", "emanuel"], required: true },
    text: { type: String, default: "" },
    /** Evita duplicados quando a mesma conversa é importada outra vez. */
    key: { type: String, required: true },
  },
  { timestamps: false, collection: "cs_mia_chat" },
);

CsMiaChatSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
CsMiaChatSchema.index({ workspaceId: 1, at: -1 });

export type CsMiaChatDoc = mongoose.InferSchemaType<typeof CsMiaChatSchema> & { _id: mongoose.Types.ObjectId };

export const CsMiaChat =
  (mongoose.models.CsMiaChat as mongoose.Model<CsMiaChatDoc>) ||
  mongoose.model<CsMiaChatDoc>("CsMiaChat", CsMiaChatSchema);
