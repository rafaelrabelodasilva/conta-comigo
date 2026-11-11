export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      config_ciclo: {
        Row: {
          created_at: string
          dia_fechamento: number
          dia_vencimento: number
          id: string
          owner_id: string
          updated_at: string
          vigente_desde: string
        }
        Insert: {
          created_at?: string
          dia_fechamento: number
          dia_vencimento: number
          id?: string
          owner_id?: string
          updated_at?: string
          vigente_desde: string
        }
        Update: {
          created_at?: string
          dia_fechamento?: number
          dia_vencimento?: number
          id?: string
          owner_id?: string
          updated_at?: string
          vigente_desde?: string
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          aparencia: string
          created_at: string
          id: string
          limite_ajuste_centavos: number
          owner_id: string
          primeiro_uso_em: string | null
          status_padrao_id: string | null
          tolerancia_atraso_dias: number
          updated_at: string
        }
        Insert: {
          aparencia?: string
          created_at?: string
          id?: string
          limite_ajuste_centavos?: number
          owner_id?: string
          primeiro_uso_em?: string | null
          status_padrao_id?: string | null
          tolerancia_atraso_dias?: number
          updated_at?: string
        }
        Update: {
          aparencia?: string
          created_at?: string
          id?: string
          limite_ajuste_centavos?: number
          owner_id?: string
          primeiro_uso_em?: string | null
          status_padrao_id?: string | null
          tolerancia_atraso_dias?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_status_padrao_fkey"
            columns: ["owner_id", "status_padrao_id"]
            isOneToOne: false
            referencedRelation: "status"
            referencedColumns: ["owner_id", "id"]
          },
        ]
      }
      fatura_cartoes: {
        Row: {
          created_at: string
          fatura_id: string
          final: string
          id: string
          owner_id: string
          total_centavos: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fatura_id: string
          final: string
          id?: string
          owner_id?: string
          total_centavos: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fatura_id?: string
          final?: string
          id?: string
          owner_id?: string
          total_centavos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fatura_cartoes_fatura_fkey"
            columns: ["owner_id", "fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["owner_id", "id"]
          },
        ]
      }
      faturas: {
        Row: {
          alerta_dispensado_em: string | null
          created_at: string
          fechamento: string | null
          id: string
          mes: string
          owner_id: string
          pagamentos_centavos: number | null
          saldo_anterior_centavos: number | null
          total_a_pagar_centavos: number | null
          total_creditos_centavos: number
          total_despesas_centavos: number
          updated_at: string
          vencimento: string
        }
        Insert: {
          alerta_dispensado_em?: string | null
          created_at?: string
          fechamento?: string | null
          id?: string
          mes: string
          owner_id?: string
          pagamentos_centavos?: number | null
          saldo_anterior_centavos?: number | null
          total_a_pagar_centavos?: number | null
          total_creditos_centavos: number
          total_despesas_centavos: number
          updated_at?: string
          vencimento: string
        }
        Update: {
          alerta_dispensado_em?: string | null
          created_at?: string
          fechamento?: string | null
          id?: string
          mes?: string
          owner_id?: string
          pagamentos_centavos?: number | null
          saldo_anterior_centavos?: number | null
          total_a_pagar_centavos?: number | null
          total_creditos_centavos?: number
          total_despesas_centavos?: number
          updated_at?: string
          vencimento?: string
        }
        Relationships: []
      }
      lancamentos: {
        Row: {
          ajuste_de_id: string | null
          apelido: string | null
          created_at: string
          data: string | null
          dividido_de_id: string | null
          duvida_extracao: boolean
          editado_em: string | null
          excluido_em: string | null
          fatura_id: string | null
          final_cartao: string | null
          id: string
          lancado_por: Database["public"]["Enums"]["lancado_por"]
          mes: string
          nome: string
          nome_normalizado: string
          observacao: string | null
          ordem_fatura: number | null
          origem_lancamento_id: string | null
          owner_id: string
          parcela_n: number | null
          parcela_total: number | null
          responsavel_id: string | null
          revisado_em: string | null
          revisao_dados: Json | null
          revisao_motivo: Database["public"]["Enums"]["revisao_motivo"] | null
          serie_id: string | null
          status_id: string | null
          tipo_id: string | null
          updated_at: string
          valor_centavos: number
        }
        Insert: {
          ajuste_de_id?: string | null
          apelido?: string | null
          created_at?: string
          data?: string | null
          dividido_de_id?: string | null
          duvida_extracao?: boolean
          editado_em?: string | null
          excluido_em?: string | null
          fatura_id?: string | null
          final_cartao?: string | null
          id?: string
          lancado_por: Database["public"]["Enums"]["lancado_por"]
          mes: string
          nome: string
          nome_normalizado: string
          observacao?: string | null
          ordem_fatura?: number | null
          origem_lancamento_id?: string | null
          owner_id?: string
          parcela_n?: number | null
          parcela_total?: number | null
          responsavel_id?: string | null
          revisado_em?: string | null
          revisao_dados?: Json | null
          revisao_motivo?: Database["public"]["Enums"]["revisao_motivo"] | null
          serie_id?: string | null
          status_id?: string | null
          tipo_id?: string | null
          updated_at?: string
          valor_centavos: number
        }
        Update: {
          ajuste_de_id?: string | null
          apelido?: string | null
          created_at?: string
          data?: string | null
          dividido_de_id?: string | null
          duvida_extracao?: boolean
          editado_em?: string | null
          excluido_em?: string | null
          fatura_id?: string | null
          final_cartao?: string | null
          id?: string
          lancado_por?: Database["public"]["Enums"]["lancado_por"]
          mes?: string
          nome?: string
          nome_normalizado?: string
          observacao?: string | null
          ordem_fatura?: number | null
          origem_lancamento_id?: string | null
          owner_id?: string
          parcela_n?: number | null
          parcela_total?: number | null
          responsavel_id?: string | null
          revisado_em?: string | null
          revisao_dados?: Json | null
          revisao_motivo?: Database["public"]["Enums"]["revisao_motivo"] | null
          serie_id?: string | null
          status_id?: string | null
          tipo_id?: string | null
          updated_at?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_ajuste_de_fkey"
            columns: ["owner_id", "ajuste_de_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["owner_id", "id"]
          },
          {
            foreignKeyName: "lancamentos_dividido_de_fkey"
            columns: ["owner_id", "dividido_de_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["owner_id", "id"]
          },
          {
            foreignKeyName: "lancamentos_fatura_fkey"
            columns: ["owner_id", "fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["owner_id", "id"]
          },
          {
            foreignKeyName: "lancamentos_origem_fkey"
            columns: ["owner_id", "origem_lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["owner_id", "id"]
          },
          {
            foreignKeyName: "lancamentos_responsavel_fkey"
            columns: ["owner_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "responsaveis"
            referencedColumns: ["owner_id", "id"]
          },
          {
            foreignKeyName: "lancamentos_serie_fkey"
            columns: ["owner_id", "serie_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["owner_id", "id"]
          },
          {
            foreignKeyName: "lancamentos_status_fkey"
            columns: ["owner_id", "status_id"]
            isOneToOne: false
            referencedRelation: "status"
            referencedColumns: ["owner_id", "id"]
          },
          {
            foreignKeyName: "lancamentos_tipo_fkey"
            columns: ["owner_id", "tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos"
            referencedColumns: ["owner_id", "id"]
          },
        ]
      }
      regras: {
        Row: {
          chave: string
          contagem: NonNullable<Json>
          created_at: string
          id: string
          owner_id: string
          responsavel_id: string | null
          tipo_id: string | null
          ultimo_uso: string
          updated_at: string
          versao_normalizacao: number
        }
        Insert: {
          chave: string
          contagem?: NonNullable<Json>
          created_at?: string
          id?: string
          owner_id?: string
          responsavel_id?: string | null
          tipo_id?: string | null
          ultimo_uso?: string
          updated_at?: string
          versao_normalizacao: number
        }
        Update: {
          chave?: string
          contagem?: NonNullable<Json>
          created_at?: string
          id?: string
          owner_id?: string
          responsavel_id?: string | null
          tipo_id?: string | null
          ultimo_uso?: string
          updated_at?: string
          versao_normalizacao?: number
        }
        Relationships: [
          {
            foreignKeyName: "regras_responsavel_fkey"
            columns: ["owner_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "responsaveis"
            referencedColumns: ["owner_id", "id"]
          },
          {
            foreignKeyName: "regras_tipo_fkey"
            columns: ["owner_id", "tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos"
            referencedColumns: ["owner_id", "id"]
          },
        ]
      }
      responsaveis: {
        Row: {
          arquivado: boolean
          cor: number
          created_at: string
          id: string
          nome: string
          ordem: number
          owner_id: string
          updated_at: string
        }
        Insert: {
          arquivado?: boolean
          cor: number
          created_at?: string
          id?: string
          nome: string
          ordem: number
          owner_id?: string
          updated_at?: string
        }
        Update: {
          arquivado?: boolean
          cor?: number
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          created_at: string
          id: string
          mes_primeira_parcela: string
          nome_normalizado: string
          ocorrencia: number
          owner_id: string
          parcela_total: number
          updated_at: string
          valor_parcela_centavos: number
        }
        Insert: {
          created_at?: string
          id?: string
          mes_primeira_parcela: string
          nome_normalizado: string
          ocorrencia: number
          owner_id?: string
          parcela_total: number
          updated_at?: string
          valor_parcela_centavos: number
        }
        Update: {
          created_at?: string
          id?: string
          mes_primeira_parcela?: string
          nome_normalizado?: string
          ocorrencia?: number
          owner_id?: string
          parcela_total?: number
          updated_at?: string
          valor_parcela_centavos?: number
        }
        Relationships: []
      }
      status: {
        Row: {
          arquivado: boolean
          conta_como_pago: boolean
          created_at: string
          id: string
          nome: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          arquivado?: boolean
          conta_como_pago?: boolean
          created_at?: string
          id?: string
          nome: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          arquivado?: boolean
          conta_como_pago?: boolean
          created_at?: string
          id?: string
          nome?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tipos: {
        Row: {
          arquivado: boolean
          created_at: string
          id: string
          nome: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          arquivado?: boolean
          created_at?: string
          id?: string
          nome: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          arquivado?: boolean
          created_at?: string
          id?: string
          nome?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      anular_id_jsonb: { Args: { de: string; doc: Json }; Returns: Json }
      classificar_em_lote: { Args: { p_itens: Json }; Returns: Json }
      contar_usos_cadastro: {
        Args: { cadastro: string }
        Returns: {
          id: string
          usos: number
        }[]
      }
      importar_fatura: {
        Args: {
          dados_cartoes: Json
          dados_fatura: Json
          dados_lancamentos: Json
          dados_previstos?: Json
          lancamentos_atualizados_em?: string
          substituir_fatura_id?: string
        }
        Returns: Json
      }
      referencias_cadastro: {
        Args: never
        Returns: {
          cadastro: string
          coluna: string
          conta_uso: boolean
          forma: string
          tabela: string
        }[]
      }
      referencias_fk_nao_listadas: {
        Args: never
        Returns: {
          coluna: string
          tabela: string
        }[]
      }
      reordenar_responsaveis: {
        Args: { ids: string[] }
        Returns: {
          arquivado: boolean
          cor: number
          created_at: string
          id: string
          nome: string
          ordem: number
          owner_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "responsaveis"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      substituir_cadastro: {
        Args: { cadastro: string; de_id: string; para_id?: string }
        Returns: undefined
      }
      trocar_id_jsonb: {
        Args: { de: string; doc: Json; para: string }
        Returns: Json
      }
      vincular_ajustes_gravados: { Args: { dono?: string }; Returns: number }
    }
    Enums: {
      lancado_por: "fatura" | "sistema" | "manual" | "historico"
      revisao_motivo: "sem_classificacao" | "sugestao" | "sugestao_duvida"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      lancado_por: ["fatura", "sistema", "manual", "historico"],
      revisao_motivo: ["sem_classificacao", "sugestao", "sugestao_duvida"],
    },
  },
} as const
