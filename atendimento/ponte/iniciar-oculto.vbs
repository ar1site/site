' Inicia a ponte (node ponte.mjs) sem janela. Usado pela tarefa agendada
' AR1-Ponte-WhatsApp. Espera o node terminar e repassa o código de saída,
' para que o Agendador de Tarefas reinicie em caso de falha.
Option Explicit
Dim shell, fso, pasta, node, comando, codigo
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = pasta

node = "node"
If WScript.Arguments.Count > 0 Then node = WScript.Arguments(0)

comando = """" & node & """ """ & fso.BuildPath(pasta, "ponte.mjs") & """"
codigo = shell.Run(comando, 0, True)
WScript.Quit codigo
