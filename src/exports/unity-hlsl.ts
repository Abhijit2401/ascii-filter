export const UNITY_HLSL = `
Shader "Hidden/ASCIIFilter"
{
    Properties
    {
        _MainTex ("Source", 2D) = "white" {}
        _CharAtlas ("Char Atlas", 2D) = "white" {}
        _CharsCount ("Chars Count", Float) = 10
        _Density ("Density", Float) = 120
        _FontAspect ("Font Aspect", Float) = 0.55
        _ColorSteps ("Color Steps", Float) = 4
        _Saturation ("Saturation", Float) = 1
        _BlackoutLimit ("Blackout Limit", Float) = 1
        _Vibrancy ("Vibrancy", Float) = 1
        _BgColor ("Background", Color) = (0,0,0,1)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            sampler2D _CharAtlas;
            float _CharsCount, _Density, _FontAspect, _ColorSteps, _Saturation, _BlackoutLimit, _Vibrancy;
            fixed4 _BgColor;

            struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; };
            struct v2f { float2 uv : TEXCOORD0; float4 vertex : SV_POSITION; };

            v2f vert (appdata v) {
                v2f o;
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float aspect = _ScreenParams.x / _ScreenParams.y;
                float2 grid = float2(_Density, (_Density / aspect) * _FontAspect);
                float2 cellUv = floor(i.uv * grid) / grid;

                fixed4 srcColor = tex2D(_MainTex, cellUv);
                float lum = dot(srcColor.rgb, float3(0.299, 0.587, 0.114));

                if (lum > _BlackoutLimit) return _BgColor;

                float vEdge = 0.05 * _Vibrancy;
                lum = smoothstep(vEdge, 1.0 - vEdge, lum);

                float3 satColor = lerp(float3(lum, lum, lum), srcColor.rgb, _Saturation);
                float3 qColor = floor(satColor * _ColorSteps + 0.5) / _ColorSteps;

                float charIndex = floor(lum * (_CharsCount - 1.0) + 0.5);
                float2 localUv = frac(i.uv * grid);
                float2 atlasUv = float2((charIndex + localUv.x) / _CharsCount, localUv.y);
                float glyphAlpha = tex2D(_CharAtlas, atlasUv).r;

                return fixed4(lerp(_BgColor.rgb, qColor, glyphAlpha), 1.0);
            }
            ENDCG
        }
    }
}
/* Ported subset: core luminance-to-glyph pipeline with aspect-correct grid.
   Fluid repel, audio reactivity, temporal trails, and palette lock are
   page-interaction / multi-pass features specific to the web build and are
   not included here; port them as additional CGPROGRAM passes if needed. */
`;
