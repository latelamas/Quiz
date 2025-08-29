// plot-handler.js - Plotly.js plotting system
window.plotData = [];

window.initPlots = function() {
    if (typeof Plotly === 'undefined') {
        console.error('Plotly not loaded');
        return;
    }
    
    window.plotData.forEach(function(plot) {
        const container = document.getElementById(plot.id);
        if (container) {
            try {
                // Generate x values
                const x = [];
                const y = [];
                const step = 0.1;
                const generateRange = 20;
                
                for (let i = -generateRange; i <= generateRange; i += step) {
                    x.push(i);
                    try {
                        let result;
                        const func = plot.latex.toLowerCase();
                        
                        if (func.includes('x^2') || func.includes('x**2')) {
                            result = i * i;
                        } else if (func.includes('sin')) {
                            result = Math.sin(i);
                        } else if (func.includes('cos')) {
                            result = Math.cos(i);
                        } else if (func.includes('tan')) {
                            if (Math.abs(Math.cos(i)) < 0.01) {
                                result = i > 0 ? 50 : -50;
                            } else {
                                result = Math.tan(i);
                            }
                        } else if (func.includes('x^3') || func.includes('x**3')) {
                            result = i * i * i;
                        } else if (func.includes('sqrt')) {
                            result = i >= 0 ? Math.sqrt(i) : null;
                        } else if (func.includes('exp')) {
                            if (i > 5) result = 100;
                            else if (i < -5) result = 0;
                            else result = Math.exp(i);
                        } else if (func.includes('log')) {
                            result = i > 0 ? Math.log(i) : null;
                        } else {
                            result = i;
                        }
                        
                        if (result === null || result === undefined || !isFinite(result)) {
                            y.push(null);
                        } else {
                            if (Math.abs(result) > 1000) {
                                result = result > 0 ? 1000 : -1000;
                            }
                            y.push(result);
                        }
                    } catch(e) {
                        y.push(null);
                    }
                }
                
                // Filter out null values
                const cleanX = [];
                const cleanY = [];
                for (let i = 0; i < x.length; i++) {
                    if (y[i] !== null) {
                        cleanX.push(x[i]);
                        cleanY.push(y[i]);
                    }
                }
                
                // Smart scaling - calculate appropriate ranges
                let xMin = Math.min(...cleanX);
                let xMax = Math.max(...cleanX);
                let yMin = Math.min(...cleanY);
                let yMax = Math.max(...cleanY);
                
                // Add padding
                const xRange = xMax - xMin;
                const yRange = yMax - yMin;
                const xPadding = xRange * 0.1;
                const yPadding = yRange * 0.1;
                
                xMin -= xPadding;
                xMax += xPadding;
                yMin -= yPadding;
                yMax += yPadding;
                
                // Handle edge cases
                if (xRange === 0) {
                    xMin -= 1;
                    xMax += 1;
                }
                if (yRange === 0) {
                    yMin -= 1;
                    yMax += 1;
                }
                
                // Ensure reasonable minimum ranges
                if (xMax - xMin < 2) {
                    const center = (xMin + xMax) / 2;
                    xMin = center - 1;
                    xMax = center + 1;
                }
                if (yMax - yMin < 2) {
                    const center = (yMin + yMax) / 2;
                    yMin = center - 1;
                    yMax = center + 1;
                }
                
                // Create Plotly trace
                const trace = {
                    x: cleanX,
                    y: cleanY,
                    type: 'scatter',
                    mode: 'lines',
                    line: {
                        color: '#2196f3',
                        width: 2
                    },
                    hoverinfo: 'none'
                };
                
                // Layout with smart scaling
                const layout = {
                    autosize: true,
                    margin: {
                        l: 50,
                        r: 20,
                        b: 50,
                        t: 20,
                        pad: 4
                    },
                    xaxis: {
                        title: 'x',
                        showgrid: true,
                        gridcolor: '#f0f0f0',
                        gridwidth: 1,
                        zeroline: true,
                        zerolinecolor: '#333',
                        zerolinewidth: 1,
                        showline: true,
                        linecolor: '#333',
                        linewidth: 1,
                        showticklabels: true,
                        tickfont: {
                            size: 12,
                            color: '#666'
                        },
                        fixedrange: true,
                        range: [xMin, xMax]
                    },
                    yaxis: {
                        title: 'y',
                        showgrid: true,
                        gridcolor: '#f0f0f0',
                        gridwidth: 1,
                        zeroline: true,
                        zerolinecolor: '#333',
                        zerolinewidth: 1,
                        showline: true,
                        linecolor: '#333',
                        linewidth: 1,
                        showticklabels: true,
                        tickfont: {
                            size: 12,
                            color: '#666'
                        },
                        fixedrange: true,
                        range: [yMin, yMax]
                    },
                    showlegend: false,
                    hovermode: false,
                    dragmode: false,
                    plot_bgcolor: 'white',
                    paper_bgcolor: 'white'
                };
                
                // Configuration - still static but with labels
                const config = {
                    displayModeBar: false,
                    displaylogo: false,
                    staticPlot: true,
                    editable: false,
                    scrollZoom: false,
                    doubleClick: false
                };
                
                // Render the plot
                Plotly.newPlot(container, [trace], layout, config);
                
                // Keep it static
                container.style.pointerEvents = 'none';
                
            } catch (e) {
                console.error('Error creating Plotly plot for ' + plot.id, e);
                container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px; font-size: 14px;">Graph</p>';
            }
        }
    });
};

// Load Plotly.js and initialize plots
document.addEventListener('DOMContentLoaded', function() {
    if (typeof Plotly === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.plot.ly/plotly-2.24.1.min.js';
        script.onload = function() {
            setTimeout(function() {
                if (typeof window.initPlots === 'function') window.initPlots();
            }, 100);
        };
        script.onerror = function() {
            console.error('Failed to load Plotly.js');
            if (window.plotData) {
                window.plotData.forEach(function(plot) {
                    const container = document.getElementById(plot.id);
                    if (container) {
                        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px; font-size: 14px;">Graph</p>';
                    }
                });
            }
        };
        document.head.appendChild(script);
    } else {
        setTimeout(function() {
            if (typeof window.initPlots === 'function') window.initPlots();
        }, 10);
    }
});
