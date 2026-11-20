// Configuração do app da Web "Atendimentos EI" no projeto EI - ATENDIMENTO.
// Firebase Console → Configurações do projeto (engrenagem) → Seus apps → app da Web → "Configuração do SDK".
// Estes valores NÃO são senhas: o acesso aos dados é protegido pelo login e pelas regras do Firestore (firestore.rules).
export const firebaseConfig = {
  apiKey: "AIzaSyCzEndnbk-BWVDYsHoc_jAe6S_VthLyRS0",
  authDomain: "ei---atendimento.firebaseapp.com",
  projectId: "ei---atendimento",
  storageBucket: "ei---atendimento.firebasestorage.app",
  messagingSenderId: "602766373091",
  appId: "1:602766373091:web:b7b88fd8b0c6697818d5d6",
  measurementId: "G-KEE0M5M5X2"
};

// Assinatura padrão das mensagens para as famílias (pode ser alterada depois na aba Equipe).
export const ASSINATURA_PADRAO = "Coordenação Pedagógica · Colégio Antares";
