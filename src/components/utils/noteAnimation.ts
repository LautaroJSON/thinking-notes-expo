// Animación con la que se abre y se cierra el panel de una nota.
// Por ahora solo los ids y el tipo, que usa noteLaunch. La lista de opciones
// y la preferencia guardada se traen con la interfaz (spec 009+).

export const NOTE_ANIMATION_IDS = ["card", "sink", "slide"] as const;

export type NoteAnimationId = (typeof NOTE_ANIMATION_IDS)[number];
