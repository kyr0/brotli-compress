export const TEST_INPUT = `[BITS 16]
[ORG 0x7c00]

MOV AL, 0x59
MOV AH, 0x0E	   ;Tell BIOS that we need to print one charater on screen.
MOV BH, 0x00	   ;Page no.
MOV BL, 0x07	   ;Text attribute 0x07 is lightgrey font on black background
INT 0x10	       ;Call video interrupt

int3

MOV AL, 0x41
MOV AH, 0x0E	   ;Tell BIOS that we need to print one charater on screen.
MOV BH, 0x00	   ;Page no.
MOV BL, 0x07	   ;Text attribute 0x07 is lightgrey font on black background
INT 0x10	       ;Call video interrupt

int3

MOV AL, 0x59
MOV AH, 0x0E     ;Tell BIOS that we need to print one charater on screen.
MOV BH, 0x00     ;Page no.
MOV BL, 0x07     ;Text attribute 0x07 is lightgrey font on black background
INT 0x10         ;Call video interrupt

jmp $

TIMES 510 - ($ - $$) db 0
DW 0xAA55 ;🤖`
