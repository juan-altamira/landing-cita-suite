export type LandingVariant = 'general' | 'odontologia';

export interface LandingCopy {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heroLead: string;
  informationQuestion: string;
  informationSummary: string;
  informationTitle: string;
  informationLead: string;
  informationDetail: string;
  informationAlt: string;
  storyOrigin: string;
  storyQuote: string;
  priceFiles: string;
  filesFaqQuestion: string;
  filesFaqAnswer: string;
  finalLead: string;
}

const copies: Record<LandingVariant, LandingCopy> = {
  general: {
    pageTitle: 'Cita Suite | Gestión para consultorios',
    pageDescription: 'Organizá agenda, pacientes, archivos y comunicación de turnos desde una misma plataforma.',
    eyebrow: 'Software de gestión para consultorios',
    heroLead: 'Organizá agenda, pacientes, archivos y comunicación de turnos desde una misma plataforma, para que recepción y profesionales trabajen con la misma información.',
    informationQuestion: '¿Alguna vez necesitaste información o archivos de un paciente y no los tenías disponibles donde los necesitabas?',
    informationSummary: 'Información del paciente dispersa',
    informationTitle: 'La información del paciente debería estar disponible cuando la necesitás',
    informationLead: 'Centralizá datos, imágenes y archivos en la ficha del paciente para que los profesionales autorizados puedan encontrarlos desde Cita Suite.',
    informationDetail: 'Sin pedir que alguien reenvíe un archivo. Sin buscar en distintos dispositivos o conversaciones.',
    informationAlt: 'Captura real de archivos asociados a la ficha de un paciente en Cita Suite',
    storyOrigin: 'El primer pedido que dio origen al producto fue simple: poder asociar archivos clínicos a cada paciente. A partir de ahí aparecieron otros problemas cotidianos, como información repartida, coordinación entre profesionales y pacientes que olvidan sus turnos.',
    storyQuote: 'Necesito encontrar la información cuando estoy con el paciente, sin depender del dispositivo de otra persona.',
    priceFiles: 'Archivos e imágenes de pacientes',
    filesFaqQuestion: '¿Puedo asociar archivos a un paciente?',
    filesFaqAnswer: 'Sí. Podés guardar imágenes y otros archivos junto a la ficha del paciente para mantener su información organizada y disponible para los profesionales autorizados.',
    finalLead: 'Probá Cita Suite y centralizá agenda, pacientes, archivos y coordinación del consultorio en una misma plataforma.'
  },
  odontologia: {
    pageTitle: 'Cita Suite para odontología | Gestión del consultorio',
    pageDescription: 'Organizá agenda, pacientes, radiografías y comunicación de turnos desde una misma plataforma.',
    eyebrow: 'Software para consultorios odontológicos',
    heroLead: 'Organizá agenda, pacientes, radiografías y comunicación de turnos desde una misma plataforma, para que recepción y profesionales trabajen con la misma información.',
    informationQuestion: '¿Alguna vez necesitaste una radiografía o información de un paciente y no la tenías disponible?',
    informationSummary: 'Radiografías e información dispersa',
    informationTitle: 'La radiografía no debería depender de quién la tenga',
    informationLead: 'Asociá radiografías y archivos a la ficha del paciente para que los profesionales autorizados puedan encontrarlos desde Cita Suite cuando los necesitan.',
    informationDetail: 'Sin pedir que alguien reenvíe la radiografía. Sin buscar en distintos dispositivos o conversaciones.',
    informationAlt: 'Captura real de radiografías asociadas a la ficha de un paciente en Cita Suite',
    storyOrigin: 'El primer pedido que dio origen al producto fue simple: poder asociar radiografías a pacientes. A partir de ahí aparecieron otros problemas cotidianos, como información repartida, coordinación entre profesionales y pacientes que olvidan sus turnos.',
    storyQuote: 'Necesito encontrar la radiografía cuando estoy con el paciente, sin depender del dispositivo de otra persona.',
    priceFiles: 'Radiografías y archivos',
    filesFaqQuestion: '¿Puedo asociar radiografías a un paciente?',
    filesFaqAnswer: 'Sí. Podés guardar radiografías y otros archivos junto a la ficha del paciente para mantener su información organizada y disponible para los profesionales autorizados.',
    finalLead: 'Probá Cita Suite y centralizá agenda, pacientes, radiografías y coordinación del consultorio en una misma plataforma.'
  }
};

export const getLandingCopy = (variant: LandingVariant): LandingCopy => copies[variant];
