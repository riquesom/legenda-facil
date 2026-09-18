; Instalador do Legenda Fácil para Windows (Inno Setup 6)
#define MeuNome "Legenda Fácil"
#define MinhaVersao "1.0"

[Setup]
AppName={#MeuNome}
AppVersion={#MinhaVersao}
AppPublisher=Legenda Fácil
DefaultDirName={autopf}\Legenda Facil
DefaultGroupName={#MeuNome}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=LegendaFacil-Instalador
Compression=lzma2/max
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
PrivilegesRequired=lowest
WizardStyle=modern
SetupIconFile=recursos\icone.ico
UninstallDisplayIcon={app}\LegendaFacil.exe
DisableDirPage=auto
DisableReadyPage=no

[Languages]
Name: "brasileiro"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "atalhodesktop"; Description: "Criar um atalho na Área de Trabalho"; GroupDescription: "Atalhos"; Flags: checkedonce

[Files]
Source: "dist\LegendaFacil\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "webview2.exe"; DestDir: "{tmp}"; Flags: dontcopy noencryption skipifsourcedoesntexist

[Icons]
Name: "{group}\{#MeuNome}"; Filename: "{app}\LegendaFacil.exe"
Name: "{autodesktop}\{#MeuNome}"; Filename: "{app}\LegendaFacil.exe"; Tasks: atalhodesktop

[Run]
Filename: "{app}\LegendaFacil.exe"; Description: "Abrir o {#MeuNome} agora"; Flags: nowait postinstall skipifsilent

[Code]
function TemWebView2: Boolean;
var
  valor: String;
begin
  Result :=
    RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', valor) or
    RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', valor) or
    RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', valor);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  codigo: Integer;
begin
  if (CurStep = ssPostInstall) and (not TemWebView2) then
  begin
    try
      ExtractTemporaryFile('webview2.exe');
      Exec(ExpandConstant('{tmp}\webview2.exe'), '/silent /install', '',
           SW_SHOW, ewWaitUntilTerminated, codigo);
    except
      // sem o componente o programa avisa sozinho ao abrir
    end;
  end;
end;
